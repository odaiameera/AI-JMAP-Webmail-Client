import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticationOptions } from '$lib/server/auth/webauthn';

export const POST: RequestHandler = async ({ url }) => {
	const options = await authenticationOptions(url);
	if (!options) error(404, 'No passkeys registered');
	return json(options);
};
