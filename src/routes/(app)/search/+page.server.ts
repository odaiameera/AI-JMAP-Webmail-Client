import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { searchEmails } from '$lib/jmap/email';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.auth) redirect(303, '/login');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const fields = (url.searchParams.get('in') ?? 'from,to,subject,body').split(',');

	if (!q) {
		return { emails: [], total: 0, query: '' };
	}

	const conditions: Record<string, unknown>[] = [];
	if (fields.includes('from')) conditions.push({ from: q });
	if (fields.includes('to')) conditions.push({ to: q });
	if (fields.includes('subject')) conditions.push({ subject: q });
	if (fields.includes('body')) conditions.push({ body: q });

	const filter = conditions.length === 1
		? conditions[0]
		: { operator: 'OR', conditions };

	const client = createClient(locals.auth);
	const result = await searchEmails(client, locals.auth.accountId, filter, { limit: 50 });

	return {
		emails: result.emails,
		total: result.total,
		query: q
	};
};
