import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { queryAndFetchEmails } from '$lib/jmap/email';
import { userEmailFromAuth } from '$lib/server/user';
import { getDefaultPageSize } from '$lib/server/db/queries/app-prefs';
import { listMarkedIds } from '$lib/server/db/queries/reminders';
import { parseListFilter, listFilterCondition } from '$lib/email-filters';

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

function parsePagination(url: URL, userId: string): { page: number; pageSize: number } {
	const defaultSize = getDefaultPageSize(userId);
	const rawSize = parseInt(url.searchParams.get('pageSize') ?? '', 10);
	const pageSize = ALLOWED_PAGE_SIZES.includes(rawSize) ? rawSize : defaultSize;
	const rawPage = parseInt(url.searchParams.get('page') ?? '', 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
	return { page, pageSize };
}

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const { mailboxes } = await parent();

	const inbox = mailboxes.find((m) => m.role === 'inbox');
	if (!inbox) {
		return {
			emails: [],
			total: 0,
			mailboxId: '',
			page: 1,
			pageSize: 50,
			totalPages: 1,
			remindedIds: [],
			filter: parseListFilter(url.searchParams.get('filter'))
		};
	}

	const userEmail = userEmailFromAuth(locals.auth);
	const { page, pageSize } = parsePagination(url, locals.user?.id ?? '');
	const filter = parseListFilter(url.searchParams.get('filter'));

	const result = await queryAndFetchEmails(client, locals.auth.accountId, inbox.id, {
		position: (page - 1) * pageSize,
		limit: pageSize,
		extraFilter: listFilterCondition(filter)
	});

	const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
	if (page > totalPages) {
		const clamped = new URL(url);
		clamped.searchParams.set('page', String(totalPages));
		redirect(303, clamped.pathname + clamped.search);
	}

	return {
		emails: result.emails,
		total: result.total,
		mailboxId: inbox.id,
		page,
		pageSize,
		totalPages,
		remindedIds: listMarkedIds(userEmail),
		filter
	};
};
