import type { AuthState } from '$lib/jmap/types';

/**
 * Decode the Stalwart principal email out of the stored Basic auth header.
 * This is the same trick the (app) layout uses; consolidating it here so
 * every per-user query has one place to look.
 */
export function userEmailFromAuth(auth: AuthState): string {
	const decoded = Buffer.from(auth.authHeader.replace('Basic ', ''), 'base64').toString();
	return decoded.split(':')[0] ?? '';
}
