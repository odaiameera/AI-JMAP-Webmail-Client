import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JMAPAuthError } from '$lib/jmap/client';
import { describeLinkError, getAccount, reauthAccount } from '$lib/server/auth/accounts';

/**
 * Standalone page (outside the (app) layout, which needs working JMAP
 * auth) shown when the active account's stored mail credentials stop
 * working — password changed on the server, or WEBMAIL_SECRET rotated.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}
	if (locals.auth) {
		redirect(303, '/inbox');
	}
	if (!locals.activeAccountId) {
		redirect(303, '/setup');
	}
	const account = getAccount(locals.activeAccountId);
	if (!account) {
		redirect(303, '/setup');
	}
	return {
		accountEmail: account.email,
		otherAccounts: (locals.accounts ?? []).filter(
			(a) => a.id !== locals.activeAccountId && !a.needsReauth
		)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user || !locals.activeAccountId) {
			redirect(303, '/login');
		}
		const account = getAccount(locals.activeAccountId);
		if (!account || account.user_id !== locals.user.id) {
			redirect(303, '/setup');
		}

		const data = await request.formData();
		const password = data.get('password')?.toString() ?? '';
		if (!password) {
			return fail(400, { error: 'Password is required' });
		}

		try {
			await reauthAccount(account, password);
		} catch (err) {
			if (err instanceof JMAPAuthError) {
				return fail(401, { error: 'The mail server rejected that password' });
			}
			console.error('[reauth] verification failed:', err);
			return fail(500, { error: describeLinkError(err, account.server_url) });
		}
		redirect(303, '/inbox');
	}
};
