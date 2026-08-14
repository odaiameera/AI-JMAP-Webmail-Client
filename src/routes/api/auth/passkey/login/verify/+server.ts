import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { verifyAuthentication } from '$lib/server/auth/webauthn';
import { createAppSession } from '$lib/server/auth/app-session';

export const POST: RequestHandler = async ({ url, request, cookies, getClientAddress }) => {
	const response = (await request.json()) as AuthenticationResponseJSON;

	let passkey;
	try {
		passkey = await verifyAuthentication(url, response);
	} catch {
		error(401, 'Passkey sign-in failed');
	}
	if (!passkey) error(401, 'Passkey sign-in failed');

	const sessionId = createAppSession(
		passkey.user_id,
		request.headers.get('user-agent') ?? undefined,
		getClientAddress()
	);
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 30 * 24 * 60 * 60
	});
	return json({ success: true });
};
