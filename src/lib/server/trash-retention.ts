import cron from 'node-cron';
import { JMAPAuthError, type JMAPClient } from '$lib/jmap/client';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { EmailUpdateError, updateEmailMailboxes } from '$lib/jmap/email';
import { findLabelsParentId } from '$lib/types/labels';
import { parseTrashRetentionDays } from '$lib/constants/trash-retention';
import { listSchedulableAuths, markNeedsReauth } from './auth/accounts';
import { getPrefs } from './db/queries/app-prefs';
import {
	clearTrashSeen,
	expiredTrashIds,
	forgetTrashIds,
	recordTrashSnapshot
} from './db/queries/trash-seen';

/**
 * Settings → Messages → "Empty Trash automatically".
 *
 * Every hour, for each linked account whose owner turned this on, look at
 * Trash, stamp the messages seen there for the first time, and permanently
 * delete those that have been there longer than the chosen period. The
 * clock is the app's own (see migration 010_trash_retention.sql): JMAP only
 * knows when a message arrived, not when it was trashed.
 */

const DAY_MS = 86_400_000;
const QUERY_PAGE = 1000;
/** Past this, the listing is treated as partial and nothing is forgotten. */
const MAX_TRASH_SCAN = 50_000;
const GET_BATCH = 200;
const SET_BATCH = 50;

export interface TrashSweepResult {
	/** Deleted for good. */
	destroyed: number;
	/** Also filed in a real folder, so only taken out of Trash. */
	untrashed: number;
}

async function listMailboxIds(
	client: JMAPClient,
	accountId: string,
	mailboxId: string
): Promise<{ ids: string[]; complete: boolean }> {
	const ids: string[] = [];
	let position = 0;
	while (position < MAX_TRASH_SCAN) {
		const res = await client.request([
			[
				'Email/query',
				{
					accountId,
					filter: { inMailbox: mailboxId },
					sort: [{ property: 'receivedAt', isAscending: true }],
					position,
					limit: QUERY_PAGE,
					calculateTotal: true
				},
				'q'
			]
		]);
		const result = res.methodResponses[0][1] as { ids?: string[]; total?: number };
		const page = result.ids ?? [];
		ids.push(...page);
		position += page.length;
		// Servers may return fewer than `limit`, so only an empty page or the
		// reported total ends the listing.
		if (page.length === 0 || (result.total !== undefined && position >= result.total)) {
			return { ids, complete: true };
		}
	}
	return { ids, complete: false };
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** One account's sweep. `accountRowId` keys the stamps; `accountId` is JMAP's. */
export async function sweepTrash(
	client: JMAPClient,
	accountId: string,
	accountRowId: string,
	retentionDays: number,
	now = Date.now()
): Promise<TrashSweepResult> {
	const result: TrashSweepResult = { destroyed: 0, untrashed: 0 };

	const mailboxes = await getMailboxes(client, accountId);
	const trash = mailboxes.find((m) => m.role === 'trash');
	if (!trash) {
		clearTrashSeen(accountRowId);
		return result;
	}

	const listing = await listMailboxIds(client, accountId, trash.id);
	recordTrashSnapshot(accountRowId, listing.ids, now, listing.complete);

	const expired = expiredTrashIds(accountRowId, now - retentionDays * DAY_MS);
	if (expired.length === 0) return result;

	// Labels are mailboxes here, and a trashed message keeps its labels, so
	// they don't count as "filed elsewhere". A real folder does: deleting
	// the message would take it out of that folder too, so it only leaves
	// Trash instead.
	const labelsParent = findLabelsParentId(mailboxes);
	const labelIds = new Set(
		labelsParent ? mailboxes.filter((m) => m.parentId === labelsParent).map((m) => m.id) : []
	);

	const destroy: string[] = [];
	const untrash: string[] = [];
	const forget: string[] = [];
	for (const batch of chunks(expired, GET_BATCH)) {
		const res = await client.request([
			['Email/get', { accountId, ids: batch, properties: ['id', 'mailboxIds'] }, 'g']
		]);
		const got = res.methodResponses[0][1] as {
			list?: { id: string; mailboxIds?: Record<string, boolean> }[];
			notFound?: string[] | null;
		};
		for (const email of got.list ?? []) {
			const boxes = Object.keys(email.mailboxIds ?? {}).filter((id) => email.mailboxIds?.[id]);
			if (!boxes.includes(trash.id)) {
				forget.push(email.id); // restored since the listing
				continue;
			}
			const filedElsewhere = boxes.some((id) => id !== trash.id && !labelIds.has(id));
			(filedElsewhere ? untrash : destroy).push(email.id);
		}
		forget.push(...(got.notFound ?? []));
	}

	for (const batch of chunks(destroy, SET_BATCH)) {
		const res = await client.request([['Email/set', { accountId, destroy: batch }, 's']]);
		const set = res.methodResponses[0][1] as {
			destroyed?: string[] | null;
			notDestroyed?: Record<string, { type?: string; description?: string }> | null;
		};
		const done = set.destroyed ?? [];
		result.destroyed += done.length;
		forget.push(...done);
		for (const [id, err] of Object.entries(set.notDestroyed ?? {})) {
			if (err.type === 'notFound') forget.push(id);
			else console.warn(`[trash] could not delete ${id}: ${err.description ?? err.type ?? 'unknown'}`);
		}
	}

	if (untrash.length > 0) {
		const changes = Object.fromEntries(untrash.map((id) => [id, { remove: [trash.id] }]));
		let failed = new Set<string>();
		try {
			await updateEmailMailboxes(client, accountId, changes);
		} catch (err) {
			if (!(err instanceof EmailUpdateError)) throw err;
			failed = new Set(err.failures.map((f) => f.id));
			console.warn(`[trash] could not take ${failed.size} message(s) out of Trash: ${err.message}`);
		}
		const moved = untrash.filter((id) => !failed.has(id));
		result.untrashed = moved.length;
		forget.push(...moved);
	}

	forgetTrashIds(accountRowId, forget);
	return result;
}

let started = false;
const inFlight = new Set<string>();

/** Sweep every linked account once. Accounts with the feature off lose their stamps. */
export async function sweepAllAccounts(now = Date.now()): Promise<void> {
	for (const { account, auth } of listSchedulableAuths()) {
		const days = parseTrashRetentionDays(getPrefs(account.user_id).trash_retention_days);
		if (days === 0) {
			// Turned off: forget the clock, so turning it back on later gives
			// everything in Trash the full period instead of purging at once.
			clearTrashSeen(account.id);
			continue;
		}
		if (inFlight.has(account.id)) continue;
		inFlight.add(account.id);
		try {
			const r = await sweepTrash(createClient(auth), auth.accountId, account.id, days, now);
			if (r.destroyed > 0 || r.untrashed > 0) {
				console.info(
					`[trash] ${account.email}: deleted ${r.destroyed} message(s) in Trash over ${days} days` +
						(r.untrashed > 0 ? `; ${r.untrashed} also filed elsewhere, taken out of Trash` : '')
				);
			}
		} catch (err) {
			if (err instanceof JMAPAuthError) markNeedsReauth(account.id);
			else console.error('[trash] sweep failed', account.email, err);
		} finally {
			inFlight.delete(account.id);
		}
	}
}

export function startTrashRetentionScheduler(): void {
	if (started) return;
	started = true;
	// Hourly: the periods are days long, so an hour of slack is invisible.
	// Minute 23 keeps it off the top of the hour, where the other jobs fire.
	cron.schedule('23 * * * *', () => {
		void sweepAllAccounts().catch((err) => console.error('[trash] sweep failed', err));
	});
}
