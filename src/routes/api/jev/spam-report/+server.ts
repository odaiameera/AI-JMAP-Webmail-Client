import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import type { Email } from '$lib/jmap/types';
import { spamRows } from '$lib/server/db/queries/jev-decisions';
import { summarizeSpam } from '$lib/server/jev/spam';

const WINDOW_DAYS = 30;
/** Disagreements listed per side. */
const LIST = 25;

/**
 * How Jev's spam calls compared with Stalwart's over the last 30 days, for
 * the active account — the numbers to look at before letting Jev act, and
 * the emails where the two disagree. Subjects and senders are read from the
 * mail server here, never stored.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth || !locals.activeAccountId) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}
	const rows = spamRows(locals.activeAccountId, Date.now() - WINDOW_DAYS * 86_400_000);
	const summary = summarizeSpam(rows);
	const byId = new Map(rows.map((r) => [r.emailId, r]));

	const listed = [...summary.jevStricter.slice(0, LIST), ...summary.jevLooser.slice(0, LIST)];
	let details = new Map<string, Email>();
	if (listed.length > 0) {
		const res = await createClient(locals.auth).request([
			[
				'Email/get',
				{ accountId: locals.auth.accountId, ids: listed, properties: ['id', 'from', 'subject', 'receivedAt'] },
				'g'
			]
		]);
		details = new Map(((res.methodResponses[0][1] as { list?: Email[] }).list ?? []).map((e) => [e.id, e]));
	}
	const describe = (id: string) => {
		const r = byId.get(id)!;
		const e = details.get(id);
		const sender = e?.from?.[0];
		return {
			id,
			// Gone from the server since (deleted): still counted, shown as such.
			from: sender?.name || sender?.email || '(no longer on the server)',
			subject: e?.subject || '',
			spam: r.spam,
			phishing: r.phishing,
			correctedTo: r.correctedTo
		};
	};

	return json({
		days: WINDOW_DAYS,
		judged: summary.judged,
		agree: summary.agree,
		unsure: summary.unsure,
		youAgreedWithJev: summary.youAgreedWithJev,
		youOverruledJev: summary.youOverruledJev,
		jevStricter: { count: summary.jevStricter.length, emails: summary.jevStricter.slice(0, LIST).map(describe) },
		jevLooser: { count: summary.jevLooser.length, emails: summary.jevLooser.slice(0, LIST).map(describe) }
	});
};
