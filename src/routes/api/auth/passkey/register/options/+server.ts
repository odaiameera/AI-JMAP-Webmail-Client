import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registrationOptions } from '$lib/server/auth/webauthn';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json(await registrationOptions(url, locals.user));
};
