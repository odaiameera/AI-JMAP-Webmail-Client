import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getEmailDetail } from '$lib/jmap/email';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const email = await getEmailDetail(client, locals.auth.accountId, params.id);

	return { email };
};
