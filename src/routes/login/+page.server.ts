import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyUserPassword } from '$lib/server/auth/user';
import { createAppSession } from '$lib/server/auth/app-session';
import { isLockedOut, recordFailure, recordSuccess } from '$lib/server/auth/rate-limit';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/inbox');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required', email });
		}

		const ip = getClientAddress();
		if (isLockedOut(email, ip)) {
			return fail(429, { error: 'Too many attempts. Try again in a few minutes.', email });
		}

		const user = verifyUserPassword(email, password);
		if (!user) {
			recordFailure(email, ip);
			return fail(401, { error: 'Invalid email or password', email });
		}

		recordSuccess(email, ip);
		const sessionId = createAppSession(
			user.id,
			request.headers.get('user-agent') ?? undefined,
			ip
		);
		cookies.set('session', sessionId, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 30 * 24 * 60 * 60
		});

		redirect(303, '/inbox');
	}
};
