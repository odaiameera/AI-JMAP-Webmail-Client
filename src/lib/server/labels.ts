import type { Cookies } from '@sveltejs/kit';
import type { JMAPClient } from '$lib/jmap/client';
import {
	LABEL_MIGRATION_COOKIE,
	LABEL_PREFIX,
	LEGACY_LABELS_COOKIE,
	DEFAULT_LABEL_COLOR,
	labelMailboxName,
	type Label
} from '$lib/types/labels';
import { createLabelMailbox, listLabelMailboxes } from '$lib/jmap/labels';
import {
	deleteLabelMeta,
	getLabelsForUser,
	upsertLabelMeta
} from '$lib/server/db/queries/label-meta';

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

/** Hydrate the per-user label metadata into the legacy `Record<id, …>`
 *  shape that the rest of the server code expects. The data lives in
 *  SQLite now (Phase 13); this just reshapes it. */
export function getLabelMeta(userEmail: string): LabelMeta {
	const rows = getLabelsForUser(userEmail);
	const out: LabelMeta = {};
	for (const r of rows) {
		out[r.mailboxId] = {
			color: r.color,
			displayName: r.displayName,
			createdAt: r.createdAt
		};
	}
	return out;
}

export function updateLabelMeta(
	userEmail: string,
	id: string,
	patch: Partial<LabelMetaEntry>
): void {
	upsertLabelMeta(userEmail, id, {
		displayName: patch.displayName ?? null,
		color: patch.color ?? null
	});
}

export function removeLabelMeta(userEmail: string, id: string): void {
	deleteLabelMeta(userEmail, id);
}

/** Pretty-print a mailbox name for users when no meta displayName exists. */
function fallbackDisplayName(mailboxName: string): string {
	return mailboxName.slice(LABEL_PREFIX.length).replace(/_/g, ' ').trim() || mailboxName;
}

/**
 * Merge the JMAP mailbox list with SQLite-backed meta (color + user-chosen
 * display name) into the Label[] shape the UI consumes.
 */
export async function listLabels(
	client: JMAPClient,
	accountId: string,
	userEmail: string
): Promise<Label[]> {
	const [mailboxes, meta] = [await listLabelMailboxes(client, accountId), getLabelMeta(userEmail)];

	const labels = mailboxes.map<Label>((m) => {
		const entry = meta[m.id];
		return {
			id: m.id,
			name: entry?.displayName?.trim() || fallbackDisplayName(m.name),
			color: entry?.color ?? DEFAULT_LABEL_COLOR,
			createdAt: entry?.createdAt ?? 0
		};
	});

	return labels.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One-shot migration from keyword-based labels (cookie `mail_labels` +
 * `keywords/<id>` on emails) to JMAP mailbox-based labels.
 *
 * Pre-Phase-13 this also seeded the cookie meta store. Now it writes
 * straight to SQLite via {@link upsertLabelMeta}.
 */
export async function migrateKeywordLabelsIfNeeded(
	client: JMAPClient,
	accountId: string,
	userEmail: string,
	cookies: Cookies
): Promise<void> {
	if (cookies.get(LABEL_MIGRATION_COOKIE) === 'v1') return;

	const rawOld = cookies.get(LEGACY_LABELS_COOKIE);
	if (!rawOld) {
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

	const existing = await listLabelMailboxes(client, accountId);
	const existingByName = new Map(existing.map((m) => [m.name, m.id]));

	for (const old of oldLabels) {
		try {
			const mailboxName = labelMailboxName(old.name);
			let newId = existingByName.get(mailboxName);

			if (!newId) {
				const result = await createLabelMailbox(client, accountId, old.name);
				if ('error' in result) continue;
				newId = result.id;
			}

			upsertLabelMeta(userEmail, newId, {
				displayName: old.name,
				color: old.color || DEFAULT_LABEL_COLOR
			});

			await migrateEmailsForLabel(client, accountId, old.id, newId);
		} catch {
			// Per-label failures are non-fatal; the next load will retry.
		}
	}

	cookies.set(LABEL_MIGRATION_COOKIE, 'v1', COOKIE_BASE);
	cookies.delete(LEGACY_LABELS_COOKIE, { path: '/' });
}

async function migrateEmailsForLabel(
	client: JMAPClient,
	accountId: string,
	oldKeyword: string,
	newMailboxId: string
): Promise<void> {
	const PAGE = 200;
	let position = 0;

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

		await client.request([['Email/set', { accountId, update }, 's']]);

		if (ids.length < PAGE) return;
		position += ids.length;
	}
}
