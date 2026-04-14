import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authenticate } from '$lib/jmap/auth';
import { JMAPAuthError } from '$lib/jmap/client';
import { createSession } from '$lib/server/session';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.auth) {
		redirect(303, '/inbox');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required', email });
		}

		try {
			const auth = await authenticate(env.JMAP_BASE_URL ?? 'https://mx.odaiameera.com', email, password);
			const sessionId = createSession(auth);

			cookies.set('session', sessionId, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				maxAge: 7 * 24 * 60 * 60
			});
		} catch (err) {
			if (err instanceof JMAPAuthError) {
				return fail(401, { error: 'Invalid email or password', email });
			}
			return fail(500, { error: 'Unable to connect to mail server', email });
		}

		redirect(303, '/inbox');
	}
};
