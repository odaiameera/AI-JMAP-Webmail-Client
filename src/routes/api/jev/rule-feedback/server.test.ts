import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recordRuleFeedback: vi.fn(), getDecision: vi.fn() }));

vi.mock('$lib/server/db/queries/jev-decisions', () => ({ getDecision: mocks.getDecision }));
vi.mock('$lib/server/db/queries/jev-learning', () => ({ recordRuleFeedback: mocks.recordRuleFeedback }));

import { POST } from './+server';

function call(body: unknown) {
	return POST({
		request: new Request('http://localhost/api/jev/rule-feedback', { method: 'POST', body: JSON.stringify(body) }),
		locals: { auth: {}, activeAccountId: 'acct-1' }
	} as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getDecision.mockReturnValue({
		rules: [
			{ ruleId: 'bills', fired: true },
			{ ruleId: 'other', fired: false }
		]
	});
});

describe('POST /api/jev/rule-feedback', () => {
	it('records a miss for a rule that fired on the email', async () => {
		expect((await call({ emailId: 'e1', ruleId: 'bills' })).status).toBe(200);
		expect(mocks.recordRuleFeedback).toHaveBeenCalledWith('acct-1', 'bills', 'e1');
	});

	it('refuses a rule that didn’t fire there', async () => {
		expect((await call({ emailId: 'e1', ruleId: 'other' })).status).toBe(400);
		expect((await call({ emailId: 'e1', ruleId: 'nope' })).status).toBe(400);
		expect(mocks.recordRuleFeedback).not.toHaveBeenCalled();
	});
});
