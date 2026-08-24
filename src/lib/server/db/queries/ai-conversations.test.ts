import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens
// it. Every module here defers getDb() to first call, so setting this before
// the first query runs is enough.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-ai-conv-')), 'test.db');

import { getDb } from '../index';
import { runMigrations } from '../migrate';
import {
	AI_HISTORY_RETENTION_DAYS,
	appendMessage,
	conversationExists,
	createConversation,
	deleteConversation,
	listConversations,
	listMessages,
	pruneExpiredConversations,
	titleFromMessage
} from './ai-conversations';

const ME = 'odai@example.test';
const SOMEONE_ELSE = 'intruder@example.test';
const DAY = 86_400_000;

beforeAll(() => {
	runMigrations();
});

beforeEach(() => {
	getDb().exec('DELETE FROM ai_conversations');
});

describe('conversations', () => {
	it('round-trips a conversation and its messages in order', () => {
		const id = createConversation(ME);
		appendMessage(id, ME, 'user', 'what did the vendor send in March?');
		appendMessage(id, ME, 'assistant', 'Two invoices.');
		appendMessage(id, ME, 'user', 'and the second one?');

		expect(listMessages(id, ME).map((m) => [m.role, m.content])).toEqual([
			['user', 'what did the vendor send in March?'],
			['assistant', 'Two invoices.'],
			['user', 'and the second one?']
		]);
	});

	it('titles a session from its opening message and keeps it stable', () => {
		const id = createConversation(ME);
		appendMessage(id, ME, 'user', 'summarise my week');
		appendMessage(id, ME, 'assistant', 'Here is the week.');
		appendMessage(id, ME, 'user', 'now do last week instead');

		expect(listConversations(ME)[0].title).toBe('summarise my week');
	});

	it('hides sessions that were opened but never used', () => {
		createConversation(ME);
		expect(listConversations(ME)).toHaveLength(0);

		const used = createConversation(ME);
		appendMessage(used, ME, 'user', 'hello');
		expect(listConversations(ME).map((c) => c.id)).toEqual([used]);
	});

	it('orders sessions by most recent activity, not creation', () => {
		// Timestamps must sit inside the retention window: listConversations
		// prunes first, so anything older would legitimately vanish.
		const now = Date.now();
		const older = createConversation(ME, now - 3 * 60_000);
		const newer = createConversation(ME, now - 2 * 60_000);
		appendMessage(newer, ME, 'user', 'second', now - 2 * 60_000);
		appendMessage(older, ME, 'user', 'first', now - 60_000);

		expect(listConversations(ME).map((c) => c.id)).toEqual([older, newer]);
	});

	it('counts the messages in each session', () => {
		const id = createConversation(ME);
		appendMessage(id, ME, 'user', 'a');
		appendMessage(id, ME, 'assistant', 'b');
		expect(listConversations(ME)[0].messageCount).toBe(2);
	});
});

describe('ownership', () => {
	it('does not let another account read a conversation by id', () => {
		const id = createConversation(ME);
		appendMessage(id, ME, 'user', 'private question');

		expect(listMessages(id, SOMEONE_ELSE)).toEqual([]);
		expect(conversationExists(id, SOMEONE_ELSE)).toBe(false);
		expect(listConversations(SOMEONE_ELSE)).toHaveLength(0);
	});

	it('does not let another account write to or delete a conversation', () => {
		const id = createConversation(ME);

		expect(appendMessage(id, SOMEONE_ELSE, 'user', 'injected')).toBe(false);
		expect(deleteConversation(id, SOMEONE_ELSE)).toBe(false);
		expect(listMessages(id, ME)).toEqual([]);
		expect(conversationExists(id, ME)).toBe(true);
	});

	it('deletes a conversation and its messages for its owner', () => {
		const id = createConversation(ME);
		appendMessage(id, ME, 'user', 'a');

		expect(deleteConversation(id, ME)).toBe(true);
		expect(conversationExists(id, ME)).toBe(false);
		expect(
			getDb().prepare('SELECT COUNT(*) AS n FROM ai_messages').get() as { n: number }
		).toEqual({ n: 0 });
	});
});

describe('retention', () => {
	it(`drops conversations idle for more than ${AI_HISTORY_RETENTION_DAYS} days`, () => {
		const now = Date.now();
		const stale = createConversation(ME, now - 30 * DAY);
		appendMessage(stale, ME, 'user', 'ancient', now - 30 * DAY);

		const fresh = createConversation(ME, now - DAY);
		appendMessage(fresh, ME, 'user', 'recent', now - DAY);

		expect(pruneExpiredConversations(now)).toBe(1);
		expect(listConversations(ME).map((c) => c.id)).toEqual([fresh]);
	});

	it('keeps an old conversation that is still being used', () => {
		const now = Date.now();
		const id = createConversation(ME, now - 30 * DAY);
		// Created long ago, replied to this morning: activity is what counts.
		appendMessage(id, ME, 'user', 'still going', now - 60_000);

		expect(pruneExpiredConversations(now)).toBe(0);
		expect(listConversations(ME)).toHaveLength(1);
	});

	it('takes the messages with it', () => {
		const now = Date.now();
		const stale = createConversation(ME, now - 30 * DAY);
		appendMessage(stale, ME, 'user', 'ancient', now - 30 * DAY);

		pruneExpiredConversations(now);
		expect(
			getDb().prepare('SELECT COUNT(*) AS n FROM ai_messages').get() as { n: number }
		).toEqual({ n: 0 });
	});
});

describe('titleFromMessage', () => {
	it('uses the first line only', () => {
		expect(titleFromMessage('find the lease\nand the addendum')).toBe('find the lease');
	});

	it('truncates a long opening line', () => {
		const title = titleFromMessage('x'.repeat(200));
		expect(title).toHaveLength(60);
		expect(title.endsWith('…')).toBe(true);
	});

	it('falls back when the message is blank', () => {
		expect(titleFromMessage('   \n  ')).toBe('New conversation');
	});
});
