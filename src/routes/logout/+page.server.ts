import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deleteAppSession } from '$lib/server/auth/app-session';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const sessionId = cookies.get('session');
		if (sessionId) {
			deleteAppSession(sessionId);
		}
		cookies.delete('session', { path: '/' });
		redirect(303, '/login');
	}
};
