import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient, fetchSession } from '$lib/jmap/auth';
import { senderInContacts } from '$lib/server/trust-sender';

/**
 * GET /api/contacts/known?email=<address>
 *
 * `{ known: true | false | null }`: whether the address is in the address
 * book. The reading view asks before it loads remote images under the
 * "Contacts only" setting. `null` means it couldn't tell (no contacts on the
 * server, or the lookup failed), and the view treats that as "not a contact",
 * so a failure never loads a tracker.
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });
	const email = url.searchParams.get('email')?.trim() ?? '';
	if (!email || email.length > 320 || !email.includes('@')) {
		return json({ error: 'email required' }, { status: 400, headers: NO_STORE });
	}
	try {
		const client = createClient(locals.auth);
		const session = await fetchSession(locals.auth);
		const known = await senderInContacts(client, session, email);
		return json({ known }, { headers: NO_STORE });
	} catch {
		return json({ known: null }, { headers: NO_STORE });
	}
};
