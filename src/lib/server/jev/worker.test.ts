import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens it.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-jevworker-')), 'test.db');

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

const jmap = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('$lib/jmap/auth', () => ({
	createClient: () => jmap.client,
	fetchSession: () => Promise.reject(new Error('no session in tests'))
}));

import { getDb } from '$lib/server/db/index';
import { runMigrations } from '$lib/server/db/migrate';
import { getJevSettings, updateJevSettings } from '$lib/server/db/queries/jev-settings';
import { getDecision, getUsage } from '$lib/server/db/queries/jev-decisions';
import type { AuthState, MethodCall } from '$lib/jmap/types';
import { sortNewMail } from './worker';

const ACCT = 'acct-1';
const ME = 'me@example.test';
const auth = { authHeader: 'Basic x', accountId: 'jmap-acc', apiUrl: 'https://mail.example/jmap/', sessionState: '' } as AuthState;
const T0 = new Date('2026-10-18T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

interface FakeEmail {
	id: string;
	threadId: string;
	mailboxIds: Record<string, boolean>;
	keywords: Record<string, boolean>;
	from: { name: string | null; email: string }[];
	to: { name: string | null; email: string }[];
	cc: null;
	subject: string;
	receivedAt: string;
	preview: string;
	'header:list-unsubscribe:asText'?: string;
}

/** Just enough JMAP for a sorting pass, over an in-memory mailbox. */
class FakeJmap {
	emails = new Map<string, FakeEmail>();

	add(id: string, minutes: number, extra: Partial<FakeEmail> = {}) {
		this.emails.set(id, {
			id,
			threadId: `t-${id}`,
			mailboxIds: { inbox: true },
			keywords: {},
			from: [{ name: null, email: 'someone@example.com' }],
			to: [{ name: null, email: ME }],
			cc: null,
			subject: 'Hello',
			receivedAt: at(minutes).toISOString(),
			preview: '',
			...extra
		});
	}

	async request(calls: MethodCall[]) {
		const done: [string, Record<string, unknown>, string][] = [];
		const resolve = (args: Record<string, unknown>) => {
			const ref = args['#ids'] as { resultOf: string; path: string } | undefined;
			if (!ref) return args.ids as string[] | null;
			const result = done.find((d) => d[2] === ref.resultOf)![1];
			if (ref.path === '/ids') return result.ids as string[];
			return (result.list as { emailIds: string[] }[]).flatMap((t) => t.emailIds);
		};
		for (const [name, args, tag] of calls) {
			let result: Record<string, unknown>;
			switch (name) {
				case 'Mailbox/get':
					result = {
						list: [
							{ id: 'inbox', name: 'Inbox', role: 'inbox', sortOrder: 1, parentId: null },
							{ id: 'sent', name: 'Sent', role: 'sent', sortOrder: 2, parentId: null },
							{ id: 'archive', name: 'Archive', role: 'archive', sortOrder: 3, parentId: null }
						]
					};
					break;
				case 'Email/query': {
					const f = args.filter as { operator?: string; conditions?: Record<string, string>[] } & Record<string, string>;
					const conds = f.operator ? f.conditions! : [f];
					const ids = [...this.emails.values()]
						.filter((e) =>
							conds.every(
								(c) =>
									(!c.inMailbox || e.mailboxIds[c.inMailbox]) &&
									(!c.after || e.receivedAt > c.after) &&
									(!c.to || e.to.some((a) => a.email === c.to))
							)
						)
						.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
						.map((e) => e.id);
					result = { ids, total: ids.length };
					break;
				}
				case 'Email/get': {
					const ids = resolve(args) ?? [];
					result = { list: ids.map((id) => this.emails.get(id)).filter(Boolean) };
					break;
				}
				case 'Thread/get':
					result = { list: (args.ids as string[]).map((id) => ({ id, emailIds: [] })) };
					break;
				case 'Email/set': {
					for (const [id, patch] of Object.entries(args.update as Record<string, Record<string, boolean>>)) {
						const e = this.emails.get(id)!;
						for (const [key, on] of Object.entries(patch)) {
							const keyword = key.replace('keywords/', '');
							if (on) e.keywords[keyword] = true;
							else delete e.keywords[keyword];
						}
					}
					result = { updated: {} };
					break;
				}
				default:
					result = {};
			}
			done.push([name, result, tag]);
		}
		return { methodResponses: done, sessionState: '' };
	}
}

let fake: FakeJmap;

beforeAll(() => {
	runMigrations();
	getDb()
		.prepare(`INSERT INTO app_user (id, email, password_hash) VALUES ('user-1', 'u@example.test', 'x')`)
		.run();
	getDb()
		.prepare(
			`INSERT INTO mail_accounts (id, user_id, email, server_url, jmap_account_id, secret_enc)
			 VALUES (?, 'user-1', ?, 'https://mail.example', 'jmap-acc', 'x')`
		)
		.run(ACCT, ME);
});

beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
	env.JEV_MOCK = '1';
	fake = new FakeJmap();
	jmap.client = fake;
	getDb().prepare('DELETE FROM jev_decisions').run();
	getDb().prepare('DELETE FROM jev_usage').run();
	// Off and on again, so every test's cursor starts at T0.
	updateJevSettings(ACCT, { autoSort: false });
	updateJevSettings(ACCT, { inboxTabs: true, autoSort: true }, T0);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('sortNewMail', () => {
	it('starts the clock on its first run instead of sorting the backlog', async () => {
		updateJevSettings(ACCT, { autoSort: false });
		updateJevSettings(ACCT, { autoSort: true }, T0);
		getDb().prepare('UPDATE jev_settings SET sort_cursor = NULL').run();
		fake.add('old', -60, { 'header:list-unsubscribe:asText': '<x>' });

		await sortNewMail(ACCT, ME, auth, at(5));

		expect(getJevSettings(ACCT).sortCursor).toBe(at(5).toISOString());
		expect(fake.emails.get('old')!.keywords).toEqual({});
	});

	it('sorts what arrived since sorting was switched on, and nothing else', async () => {
		fake.add('old', -10, { 'header:list-unsubscribe:asText': '<x>' });
		fake.add('news', 1, { 'header:list-unsubscribe:asText': '<x>', subject: 'Issue 212' });
		fake.add('promo', 2, { 'header:list-unsubscribe:asText': '<x>', subject: '48 hours: 30% off' });
		fake.add('person', 3, { from: [{ name: 'Sam', email: 'sam@example.com' }] });
		// You moved this to Updates before Jev got to it: it stays there.
		fake.add('moved', 4, { 'header:list-unsubscribe:asText': '<x>', keywords: { $cat_updates: true } });

		await sortNewMail(ACCT, ME, auth, at(10));

		expect(fake.emails.get('old')!.keywords).toEqual({});
		expect(fake.emails.get('news')!.keywords).toEqual({ $cat_newsletters: true });
		expect(fake.emails.get('promo')!.keywords).toEqual({ $cat_promotions: true });
		expect(fake.emails.get('person')!.keywords).toEqual({});
		expect(fake.emails.get('moved')!.keywords).toEqual({ $cat_updates: true });

		expect(getDecision(ACCT, 'news')).toMatchObject({ status: 'done', category: 'newsletters', applied: 'newsletters', model: 'mock' });
		expect(getDecision(ACCT, 'person')).toMatchObject({ status: 'done', category: 'important', applied: 'important' });
		expect(getDecision(ACCT, 'moved')).toMatchObject({ status: 'done', category: 'newsletters', applied: null });
		expect(getDecision(ACCT, 'old')).toBeNull();
		expect(getJevSettings(ACCT).sortCursor).toBe(at(10).toISOString());
		// Mock answers cost nothing and aren't counted.
		expect(getUsage(ACCT).requests).toBe(0);
	});

	it('does nothing while the tabs are off', async () => {
		updateJevSettings(ACCT, { inboxTabs: false });
		fake.add('news', 1, { 'header:list-unsubscribe:asText': '<x>' });
		await sortNewMail(ACCT, ME, auth, at(10));
		expect(getDecision(ACCT, 'news')).toBeNull();
	});

	it('retries an email when TypeSafe fails, and counts live usage when it answers', async () => {
		delete env.JEV_MOCK;
		env.TYPESAFE_API_KEY = 'ts-test-key';
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		fake.add('news', 1, { 'header:list-unsubscribe:asText': '<x>' });

		await sortNewMail(ACCT, ME, auth, at(10));
		expect(getDecision(ACCT, 'news')).toMatchObject({ status: 'pending', attempts: 1 });
		expect(fake.emails.get('news')!.keywords).toEqual({});

		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					model: 'jev-1.13.0',
					answers: {
						category: {
							type: 'choice',
							choice: 'newsletters',
							probabilities: { important: 0.05, updates: 0.05, newsletters: 0.85, promotions: 0.05 },
							confidence: 0.8
						}
					},
					usage: { input_tokens: 750, output_tokens: 2 }
				}),
				{ status: 200 }
			)
		);
		await sortNewMail(ACCT, ME, auth, at(11));
		expect(getDecision(ACCT, 'news')).toMatchObject({ status: 'done', applied: 'newsletters', model: 'jev-1.13.0' });
		expect(fake.emails.get('news')!.keywords).toEqual({ $cat_newsletters: true });
		expect(getUsage(ACCT)).toEqual({ requests: 1, inputTokens: 750 });
	});

	it('skips mail that left the Inbox before Jev got to it', async () => {
		fake.add('gone', 1);
		const realRequest = fake.request.bind(fake);
		// Archived between being queued and being judged.
		let archived = false;
		fake.request = async (calls: MethodCall[]) => {
			if (!archived && calls[0][0] === 'Email/get' && (calls[0][1].ids as string[] | undefined)?.includes('gone')) {
				fake.emails.get('gone')!.mailboxIds = { archive: true };
				archived = true;
			}
			return realRequest(calls);
		};
		await sortNewMail(ACCT, ME, auth, at(10));
		expect(getDecision(ACCT, 'gone')?.status).toBe('skipped');
	});
});
