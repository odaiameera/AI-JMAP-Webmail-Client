import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens it.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-trash-')), 'test.db');

import { getDb } from './db/index';
import { runMigrations } from './db/migrate';
import { clearTrashSeen, expiredTrashIds } from './db/queries/trash-seen';
import { sweepTrash } from './trash-retention';
import type { JMAPClient } from '$lib/jmap/client';
import type { MethodCall } from '$lib/jmap/types';

const DAY = 86_400_000;
const ACCOUNT_ROW = 'acct-1';
const T0 = Date.UTC(2026, 8, 1);

const mailbox = (id: string, name: string, role: string | null, parentId: string | null = null) => ({
	id, name, role, parentId, sortOrder: 0, totalEmails: 0, unreadEmails: 0
});

/** Just enough of a JMAP server for the sweep: one call per request. */
class FakeJmap {
	mailboxes = [
		mailbox('inbox', 'Inbox', 'inbox'),
		mailbox('trash', 'Trash', 'trash'),
		mailbox('work', 'Work', null),
		mailbox('labels', 'Labels', null),
		mailbox('lbl-receipts', 'Receipts', null, 'labels')
	];
	emails = new Map<string, Record<string, boolean>>();
	destroyed: string[] = [];

	async request(calls: MethodCall[]) {
		const [name, args, tag] = calls[0];
		const reply = (body: Record<string, unknown>) => ({
			methodResponses: [[name, body, tag]] as [string, Record<string, unknown>, string][],
			sessionState: ''
		});
		switch (name) {
			case 'Mailbox/get':
				return reply({ list: this.mailboxes });
			case 'Email/query': {
				const inMailbox = (args.filter as { inMailbox: string }).inMailbox;
				const ids = [...this.emails].filter(([, boxes]) => boxes[inMailbox]).map(([id]) => id);
				const position = args.position as number;
				// Page smaller than asked, like a server with a lower cap.
				return reply({ ids: ids.slice(position, position + 2), total: ids.length });
			}
			case 'Email/get': {
				const ids = args.ids as string[];
				return reply({
					list: ids.filter((id) => this.emails.has(id)).map((id) => ({ id, mailboxIds: { ...this.emails.get(id) } })),
					notFound: ids.filter((id) => !this.emails.has(id))
				});
			}
			case 'Email/set': {
				const destroyed: string[] = [];
				for (const id of (args.destroy as string[] | undefined) ?? []) {
					if (this.emails.delete(id)) destroyed.push(id);
				}
				this.destroyed.push(...destroyed);
				const updated: Record<string, null> = {};
				for (const [id, patch] of Object.entries((args.update as Record<string, { mailboxIds?: Record<string, boolean> }>) ?? {})) {
					if (patch.mailboxIds) this.emails.set(id, patch.mailboxIds);
					updated[id] = null;
				}
				return reply({ destroyed, updated });
			}
		}
		throw new Error(`unexpected ${name}`);
	}

	asClient() {
		return this as unknown as JMAPClient;
	}
}

beforeAll(() => {
	runMigrations();
	const db = getDb();
	db.prepare(`INSERT INTO app_user (id, email, password_hash) VALUES ('u1', 'me@example.test', 'x')`).run();
	db.prepare(
		`INSERT INTO mail_accounts (id, user_id, email, server_url, jmap_account_id, secret_enc)
		 VALUES (?, 'u1', 'me@example.test', 'https://mail.example.test', 'jmap-1', 'x')`
	).run(ACCOUNT_ROW);
});

beforeEach(() => {
	clearTrashSeen(ACCOUNT_ROW);
});

describe('sweepTrash', () => {
	it('starts the clock when it first sees a message, not when the message arrived', async () => {
		const jmap = new FakeJmap();
		jmap.emails.set('old', { trash: true }); // received years ago, trashed today
		expect(await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0)).toEqual({ destroyed: 0, untrashed: 0 });
		expect(jmap.emails.has('old')).toBe(true);

		// Six days on, still inside the period.
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 6 * DAY);
		expect(jmap.emails.has('old')).toBe(true);
	});

	it('deletes what has been in Trash past the period and leaves everything else', async () => {
		const jmap = new FakeJmap();
		jmap.emails.set('plain', { trash: true });
		jmap.emails.set('labelled', { trash: true, 'lbl-receipts': true });
		jmap.emails.set('also-filed', { trash: true, work: true });
		jmap.emails.set('inbox-mail', { inbox: true });
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0);

		jmap.emails.set('newcomer', { trash: true }); // trashed later
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 3 * DAY);

		const result = await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 7 * DAY + 1);
		expect(result).toEqual({ destroyed: 2, untrashed: 1 });
		expect(jmap.destroyed.sort()).toEqual(['labelled', 'plain']);
		// Filed in a real folder too: only taken out of Trash, never deleted.
		expect(jmap.emails.get('also-filed')).toEqual({ work: true });
		expect(jmap.emails.has('inbox-mail')).toBe(true);
		expect(jmap.emails.has('newcomer')).toBe(true);
		// The handled messages' stamps are gone; the newcomer's clock runs on.
		expect(expiredTrashIds(ACCOUNT_ROW, T0 + 1)).toEqual([]);
		expect(expiredTrashIds(ACCOUNT_ROW, T0 + 3 * DAY)).toEqual(['newcomer']);
	});

	it('restarts the clock for a message restored and trashed again', async () => {
		const jmap = new FakeJmap();
		jmap.emails.set('m', { trash: true });
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0);

		jmap.emails.set('m', { inbox: true }); // restored
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 5 * DAY);

		jmap.emails.set('m', { trash: true }); // trashed again
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 6 * DAY);
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 8 * DAY);
		expect(jmap.emails.has('m')).toBe(true);

		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 7, T0 + 13 * DAY + 1);
		expect(jmap.emails.has('m')).toBe(false);
	});

	it('forgets a message deleted by hand before its time', async () => {
		const jmap = new FakeJmap();
		jmap.emails.set('m', { trash: true });
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 30, T0);
		jmap.emails.delete('m');
		await sweepTrash(jmap.asClient(), 'jmap-1', ACCOUNT_ROW, 30, T0 + DAY);
		expect(expiredTrashIds(ACCOUNT_ROW, T0 + 365 * DAY)).toEqual([]);
	});
});
