import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { JMAPAuthError } from '$lib/jmap/client';
import { linkAccount, listAccounts, toPublic } from '$lib/server/auth/accounts';
import { DEFAULT_LABEL_COLOR } from '$lib/constants/colors';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json({ accounts: listAccounts(locals.user.id).map(toPublic) });
};

/** Link a new mail account: verify against the mail server, store encrypted. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	const body = (await request.json()) as {
		email?: string;
		password?: string;
		serverUrl?: string;
		color?: string;
		displayName?: string;
	};
	const email = body.email?.trim() ?? '';
	const password = body.password ?? '';
	if (!email || !password) error(400, 'Email and password are required');

	// Default server: explicit > env > wherever the existing accounts live.
	const serverUrl =
		body.serverUrl?.trim().replace(/\/+$/, '') ||
		env.JMAP_BASE_URL ||
		listAccounts(locals.user.id)[0]?.server_url;
	if (!serverUrl) error(400, 'No mail server configured');

	try {
		const account = await linkAccount({
			userId: locals.user.id,
			email,
			password,
			serverUrl,
			color: body.color || DEFAULT_LABEL_COLOR.hex,
			displayName: body.displayName?.trim() || undefined
		});
		return json({ account });
	} catch (err) {
		if (err instanceof JMAPAuthError) {
			error(401, 'The mail server rejected those credentials');
		}
		error(502, 'Unable to reach the mail server');
	}
};
