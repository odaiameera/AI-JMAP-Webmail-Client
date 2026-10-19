import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	senders: [] as string[],
	setEmailCategory: vi.fn(),
	recordCorrections: vi.fn(),
	recordSenderMoves: vi.fn(),
	forgetSenderMoves: vi.fn(),
	getPinCategory: vi.fn(),
	jevEnabled: true
}));

vi.mock('$lib/jmap/auth', () => ({
	createClient: () => ({
		request: async () => ({
			methodResponses: [['Email/get', { list: mocks.senders.map((email) => ({ from: [{ email }] })) }, 'g']],
			sessionState: ''
		})
	})
}));
vi.mock('$lib/jmap/email', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/jmap/email')>()),
	setEmailCategory: mocks.setEmailCategory
}));
vi.mock('$lib/server/db/queries/jev-decisions', () => ({ recordCorrections: mocks.recordCorrections }));
vi.mock('$lib/server/db/queries/jev-learning', () => ({
	recordSenderMoves: mocks.recordSenderMoves,
	forgetSenderMoves: mocks.forgetSenderMoves,
	getPinCategory: mocks.getPinCategory
}));
vi.mock('$lib/server/db/queries/jev-settings', () => ({
	getJevSettings: () => ({ inboxTabs: true, jevEnabled: mocks.jevEnabled, sortCursor: null })
}));

import { POST } from './+server';

async function move(body: Record<string, unknown>) {
	const res = await POST({
		request: new Request('http://localhost/api/email/bulk', { method: 'POST', body: JSON.stringify(body) }),
		locals: { auth: { accountId: 'jmap' }, activeAccountId: 'acct-1' }
	} as unknown as Parameters<typeof POST>[0]);
	return res.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.jevEnabled = true;
	mocks.getPinCategory.mockReturnValue(null);
});

describe('moving mail to a tab', () => {
	it('records the move per sender and offers to pin a single sender', async () => {
		mocks.senders = ['Jobs@LinkedIn.com', 'jobs@linkedin.com'];
		const res = await move({ ids: ['a', 'b'], action: 'setCategory', category: 'updates' });

		expect(mocks.setEmailCategory).toHaveBeenCalledWith(expect.anything(), 'jmap', ['a', 'b'], 'updates');
		expect(mocks.recordCorrections).toHaveBeenCalledWith('acct-1', ['a', 'b'], 'updates');
		expect(mocks.recordSenderMoves).toHaveBeenCalledWith(
			'acct-1',
			['jobs@linkedin.com', 'jobs@linkedin.com'],
			'updates'
		);
		expect(res.pinSuggestion).toEqual({ sender: 'jobs@linkedin.com', category: 'updates' });
	});

	it('offers no pin for several senders, an existing pin, or while Jev is off', async () => {
		mocks.senders = ['a@x.example', 'b@y.example'];
		expect((await move({ ids: ['a', 'b'], action: 'setCategory', category: 'updates' })).pinSuggestion).toBeNull();

		mocks.senders = ['a@x.example'];
		mocks.getPinCategory.mockReturnValue('updates');
		expect((await move({ ids: ['a'], action: 'setCategory', category: 'updates' })).pinSuggestion).toBeNull();

		mocks.getPinCategory.mockReturnValue(null);
		mocks.jevEnabled = false;
		expect((await move({ ids: ['a'], action: 'setCategory', category: 'updates' })).pinSuggestion).toBeNull();
	});

	it('takes an undone move back out of the history instead of adding one', async () => {
		mocks.senders = ['a@x.example'];
		const res = await move({ ids: ['a'], action: 'setCategory', category: 'important', undoOf: 'updates' });
		expect(mocks.forgetSenderMoves).toHaveBeenCalledWith('acct-1', ['a@x.example'], 'updates');
		expect(mocks.recordSenderMoves).not.toHaveBeenCalled();
		expect(res.pinSuggestion).toBeNull();
	});
});
