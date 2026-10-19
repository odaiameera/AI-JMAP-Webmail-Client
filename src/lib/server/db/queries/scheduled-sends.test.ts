import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens it.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-sched-')), 'test.db');

import { getDb } from '../index';
import { runMigrations } from '../migrate';
import {
	cancelScheduledSendRow,
	claimDueSends,
	failScheduledSend,
	getScheduledSend,
	insertScheduledSend,
	listScheduledSends,
	recoverInterruptedSends,
	retryScheduledSendLater,
	retryScheduledSendNow
} from './scheduled-sends';

const ACCT = 'acct-1';
const envelope = { mailFrom: { email: 'me@example.test' }, rcptTo: [{ email: 'you@example.test' }] };
const past = () => new Date(Date.now() - 1000).toISOString();
const future = () => new Date(Date.now() + 3_600_000).toISOString();

function schedule(emailId: string, sendAt: string) {
	insertScheduledSend({ mailAccountId: ACCT, emailId, identityId: 'id-1', envelope, sendAt });
}

beforeAll(() => {
	runMigrations();
	getDb()
		.prepare(`INSERT INTO app_user (id, email, password_hash) VALUES ('user-1', 'me@example.test', 'x')`)
		.run();
	getDb()
		.prepare(
			`INSERT INTO mail_accounts (id, user_id, email, server_url, jmap_account_id, secret_enc)
			 VALUES (?, 'user-1', 'a@example.test', 'https://mail.example', 'jmap', 'x')`
		)
		.run(ACCT);
});

beforeEach(() => {
	getDb().prepare('DELETE FROM scheduled_sends').run();
});

describe('claimDueSends', () => {
	it('claims due sends once, and leaves later ones', () => {
		schedule('due', past());
		schedule('later', future());

		const claimed = claimDueSends();
		expect(claimed.map((r) => r.jmap_email_id)).toEqual(['due']);
		expect(claimed[0].status).toBe('sending');
		expect(claimed[0].attempts).toBe(1);
		expect(JSON.parse(claimed[0].envelope)).toEqual(envelope);

		expect(claimDueSends()).toEqual([]);
	});
});

describe('cancelScheduledSendRow', () => {
	it('cancels a pending or failed send', () => {
		schedule('pending', future());
		schedule('failed', past());
		const [failed] = claimDueSends();
		failScheduledSend(failed.id, 'refused');

		expect(cancelScheduledSendRow(ACCT, 'pending')?.jmap_email_id).toBe('pending');
		expect(cancelScheduledSendRow(ACCT, 'failed')?.jmap_email_id).toBe('failed');
		expect(listScheduledSends(ACCT)).toEqual([]);
	});

	it('won’t cancel a send that is under way', () => {
		schedule('busy', past());
		claimDueSends();
		expect(cancelScheduledSendRow(ACCT, 'busy')).toBeNull();
		expect(getScheduledSend(ACCT, 'busy')?.status).toBe('sending');
	});

	it('only touches the account it is asked about', () => {
		schedule('mine', future());
		expect(cancelScheduledSendRow('someone-else', 'mine')).toBeNull();
		expect(getScheduledSend(ACCT, 'mine')).not.toBeNull();
	});
});

describe('retries', () => {
	it('puts a failed send back in the queue, due now', () => {
		schedule('x', past());
		const [row] = claimDueSends();
		failScheduledSend(row.id, 'refused');
		expect(getScheduledSend(ACCT, 'x')?.last_error).toBe('refused');

		expect(retryScheduledSendNow(ACCT, 'x')?.status).toBe('pending');
		const [again] = claimDueSends();
		expect(again.jmap_email_id).toBe('x');
		expect(again.attempts).toBe(1);
		expect(again.last_error).toBeNull();
	});

	it('only retries a failed send', () => {
		schedule('y', future());
		expect(retryScheduledSendNow(ACCT, 'y')).toBeNull();
	});

	it('waits until the retry time after a network failure', () => {
		schedule('z', past());
		const [row] = claimDueSends();
		retryScheduledSendLater(row.id, future(), 'timeout');
		expect(claimDueSends()).toEqual([]);
		expect(getScheduledSend(ACCT, 'z')).toMatchObject({ status: 'pending', last_error: 'timeout', attempts: 1 });
	});
});

describe('recoverInterruptedSends', () => {
	it('returns sends a stopped process was making to the queue', () => {
		schedule('mid', past());
		claimDueSends();
		recoverInterruptedSends();
		expect(claimDueSends().map((r) => r.jmap_email_id)).toEqual(['mid']);
	});
});
