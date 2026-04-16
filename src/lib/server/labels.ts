import type { Cookies } from '@sveltejs/kit';
import type { JMAPClient } from '$lib/jmap/client';
import {
	LABEL_META_COOKIE,
	LABEL_MIGRATION_COOKIE,
	LABEL_PREFIX,
	LEGACY_LABELS_COOKIE,
	DEFAULT_LABEL_COLOR,
	labelMailboxName,
	type Label
} from '$lib/types/labels';
import { createLabelMailbox, listLabelMailboxes } from '$lib/jmap/labels';

export interface LabelMetaEntry {
	color: string;
	displayName: string;
	createdAt: number;
}

export type LabelMeta = Record<string, LabelMetaEntry>;

const COOKIE_BASE = {
	path: '/',
	maxAge: 60 * 60 * 24 * 365,
	httpOnly: false,
	sameSite: 'strict',
	secure: true
} as const;

function readMeta(cookies: Cookies): LabelMeta {
	const raw = cookies.get(LABEL_META_COOKIE);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(decodeURIComponent(raw));
		return parsed && typeof parsed === 'object' ? (parsed as LabelMeta) : {};
	} catch {
		return {};
	}
}

function writeMeta(cookies: Cookies, meta: LabelMeta): void {
	cookies.set(LABEL_META_COOKIE, encodeURIComponent(JSON.stringify(meta)), COOKIE_BASE);
}

export function getLabelMeta(cookies: Cookies): LabelMeta {
	return readMeta(cookies);
}

export function updateLabelMeta(
	cookies: Cookies,
	id: string,
	patch: Partial<LabelMetaEntry>
): LabelMeta {
	const meta = readMeta(cookies);
	const existing = meta[id] ?? { color: DEFAULT_LABEL_COLOR, displayName: '', createdAt: Date.now() };
	meta[id] = { ...existing, ...patch };
	writeMeta(cookies, meta);
	return meta;
}

export function removeLabelMeta(cookies: Cookies, id: string): LabelMeta {
	const meta = readMeta(cookies);
	delete meta[id];
	writeMeta(cookies, meta);
	return meta;
}

/** Pretty-print a mailbox name for users when no meta displayName exists. */
function fallbackDisplayName(mailboxName: string): string {
	return mailboxName.slice(LABEL_PREFIX.length).replace(/_/g, ' ').trim() || mailboxName;
}

/**
 * Merge the JMAP mailbox list with cookie-backed meta (color + user-chosen
 * display name) into the Label[] shape the UI consumes.
 */
export async function listLabels(
	client: JMAPClient,
	accountId: string,
	cookies: Cookies
): Promise<Label[]> {
	const [mailboxes, meta] = [await listLabelMailboxes(client, accountId), readMeta(cookies)];

	const labels = mailboxes.map<Label>((m) => {
		const entry = meta[m.id];
		return {
			id: m.id,
			name: entry?.displayName?.trim() || fallbackDisplayName(m.name),
			color: entry?.color ?? DEFAULT_LABEL_COLOR,
			createdAt: entry?.createdAt ?? 0
		};
	});

	// Stable, user-friendly order.
	return labels.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One-shot, idempotent migration from keyword-based labels (cookie
 * `mail_labels` + `keywords/<id>` on emails) to JMAP mailbox-based labels.
 *
 * Safe to call on every layout load — returns immediately once the marker
 * cookie is set.
 */
export async function migrateKeywordLabelsIfNeeded(
	client: JMAPClient,
	accountId: string,
	cookies: Cookies
): Promise<void> {
	if (cookies.get(LABEL_MIGRATION_COOKIE) === 'v1') return;

	const rawOld = cookies.get(LEGACY_LABELS_COOKIE);
	if (!rawOld) {
		// Nothing to migrate — mark done so we don't re-check.
		cookies.set(LABEL_MIGRATION_COOKIE, 'v1', COOKIE_BASE);
		return;
	}

	type OldLabel = { id: string; name: string; color: string; createdAt?: number };
	let oldLabels: OldLabel[] = [];
	try {
		const parsed = JSON.parse(decodeURIComponent(rawOld));
		if (Array.isArray(parsed)) oldLabels = parsed;
	} catch {
		// Malformed cookie — treat as empty and move on.
	}

	if (oldLabels.length === 0) {
		cookies.set(LABEL_MIGRATION_COOKIE, 'v1', COOKIE_BASE);
		cookies.delete(LEGACY_LABELS_COOKIE, { path: '/' });
		return;
	}

	// Existing label mailboxes — used to dedupe when a retry happens mid-flight.
	const existing = await listLabelMailboxes(client, accountId);
	const existingByName = new Map(existing.map((m) => [m.name, m.id]));

	const meta = readMeta(cookies);

	for (const old of oldLabels) {
		try {
			const mailboxName = labelMailboxName(old.name);
			let newId = existingByName.get(mailboxName);

			if (!newId) {
				const result = await createLabelMailbox(client, accountId, old.name);
				if ('error' in result) continue;
				newId = result.id;
			}

			meta[newId] = {
				color: old.color || DEFAULT_LABEL_COLOR,
				displayName: old.name,
				createdAt: old.createdAt ?? Date.now()
			};

			await migrateEmailsForLabel(client, accountId, old.id, newId);
		} catch {
			// Per-label failures are non-fatal; the next load will retry.
		}
	}

	writeMeta(cookies, meta);
	cookies.set(LABEL_MIGRATION_COOKIE, 'v1', COOKIE_BASE);
	cookies.delete(LEGACY_LABELS_COOKIE, { path: '/' });
}

/**
 * Translate messages carrying `keywords/<oldKeyword>=true` so they instead
 * belong to the new label mailbox. Runs in batches to stay under JMAP
 * payload limits.
 */
async function migrateEmailsForLabel(
	client: JMAPClient,
	accountId: string,
	oldKeyword: string,
	newMailboxId: string
): Promise<void> {
	const PAGE = 200;
	let position = 0;

	// Hard cap to avoid an unbounded loop if the server keeps returning items.
	for (let safety = 0; safety < 100; safety++) {
		const response = await client.request([
			[
				'Email/query',
				{
					accountId,
					filter: { hasKeyword: oldKeyword },
					position,
					limit: PAGE,
					calculateTotal: true
				},
				'q'
			]
		]);

		const queryResult = response.methodResponses[0][1] as {
			ids?: string[];
			total?: number;
		};
		const ids = queryResult.ids ?? [];
		if (ids.length === 0) return;

		const update: Record<string, Record<string, unknown>> = {};
		for (const id of ids) {
			update[id] = {
				[`mailboxIds/${newMailboxId}`]: true,
				[`keywords/${oldKeyword}`]: null
			};
		}

		await client.request([
			['Email/set', { accountId, update }, 's']
		]);

		if (ids.length < PAGE) return;
		position += ids.length;
	}
}
