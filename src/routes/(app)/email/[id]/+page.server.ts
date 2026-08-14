import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getEmailDetail } from '$lib/jmap/email';
import { userEmailFromAuth } from '$lib/server/user';
import { clearMarker } from '$lib/server/db/queries/reminders';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const email = await getEmailDetail(client, locals.auth.accountId, params.id);

	// Opening a reminded email clears its clock badge. Cheap SQL; running
	// on every open is fine (idempotent DELETE).
	clearMarker(userEmailFromAuth(locals.auth), params.id);

	return { email };
};
