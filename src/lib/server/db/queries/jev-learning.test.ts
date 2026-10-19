import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens it.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-jevlearn-')), 'test.db');

import { getDb } from '../index';
import { runMigrations } from '../migrate';
import { enqueueEmails, recordDecision } from './jev-decisions';
import {
	deletePin,
	forgetSenderMoves,
	getPinCategory,
	hasRuleFeedback,
	listPins,
	normalizePinSender,
	pinFor,
	recordRuleFeedback,
	recordSenderMoves,
	ruleStats,
	senderHistory,
	setPin
} from './jev-learning';

const ACCT = 'acct-1';

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

describe('pins', () => {
	it('accept an address or an @domain, lowercased', () => {
		expect(normalizePinSender(' Jobs@LinkedIn.com ')).toBe('jobs@linkedin.com');
		expect(normalizePinSender('@LinkedIn.com')).toBe('@linkedin.com');
		expect(normalizePinSender('linkedin')).toBeNull();
		expect(normalizePinSender('@')).toBeNull();
	});

	it('are stored, changed and removed per account', () => {
		setPin(ACCT, '@linkedin.com', 'updates');
		setPin(ACCT, 'jobs@linkedin.com', 'newsletters');
		setPin(ACCT, '@linkedin.com', 'promotions');
		expect(listPins(ACCT).map((p) => [p.sender, p.category])).toEqual([
			['@linkedin.com', 'promotions'],
			['jobs@linkedin.com', 'newsletters']
		]);
		expect(getPinCategory(ACCT, 'jobs@linkedin.com')).toBe('newsletters');
		deletePin(ACCT, 'jobs@linkedin.com');
		expect(getPinCategory(ACCT, 'jobs@linkedin.com')).toBeNull();
	});

	it('let an address pin win over its domain’s', () => {
		const pins = [
			{ sender: '@linkedin.com', category: 'promotions' as const, createdAt: 0 },
			{ sender: 'jobs@linkedin.com', category: 'newsletters' as const, createdAt: 0 }
		];
		expect(pinFor(pins, 'Jobs@LinkedIn.com')?.category).toBe('newsletters');
		expect(pinFor(pins, 'news@linkedin.com')?.category).toBe('promotions');
		expect(pinFor(pins, 'someone@else.com')).toBeNull();
	});
});

describe('sender history', () => {
	it('reads back as a sentence, most-moved tab first', () => {
		expect(senderHistory(ACCT, 'shop@example.com')).toBeNull();
		recordSenderMoves(ACCT, ['shop@example.com', 'shop@example.com', 'shop@example.com'], 'promotions');
		recordSenderMoves(ACCT, ['shop@example.com'], 'updates');
		expect(senderHistory(ACCT, 'shop@example.com')).toBe(
			'You have moved 3 earlier emails from this sender to Promotions and 1 to Updates.'
		);
	});

	it('forgets a move that was undone', () => {
		forgetSenderMoves(ACCT, ['shop@example.com'], 'updates');
		expect(senderHistory(ACCT, 'shop@example.com')).toBe(
			'You have moved 3 earlier emails from this sender to Promotions.'
		);
	});
});

describe('rule feedback', () => {
	it('sets misses against the rule’s hits', () => {
		const check = (fired: boolean) => [
			{ ruleId: 'bills', ruleName: 'Bills', statement: 's', probability: 0.9, threshold: 0.8, negate: false, fired }
		];
		enqueueEmails(ACCT, ['e1', 'e2', 'e3']);
		recordDecision(ACCT, 'e1', { category: null, confidence: null, applied: null, answers: {}, facts: {}, rules: check(true), model: 'm', inputTokens: 1 });
		recordDecision(ACCT, 'e2', { category: null, confidence: null, applied: null, answers: {}, facts: {}, rules: check(true), model: 'm', inputTokens: 1 });
		recordDecision(ACCT, 'e3', { category: null, confidence: null, applied: null, answers: {}, facts: {}, rules: check(false), model: 'm', inputTokens: 1 });

		recordRuleFeedback(ACCT, 'bills', 'e2');
		recordRuleFeedback(ACCT, 'bills', 'e2'); // once per email
		expect(hasRuleFeedback(ACCT, 'bills', 'e2')).toBe(true);
		expect(hasRuleFeedback(ACCT, 'bills', 'e1')).toBe(false);
		expect(ruleStats(ACCT)).toEqual({ bills: { hits: 2, misses: 1 } });
	});
});
