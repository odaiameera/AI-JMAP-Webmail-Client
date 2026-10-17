import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listAccounts: vi.fn(),
	updateJevSettings: vi.fn()
}));

vi.mock('$lib/server/auth/accounts', () => ({ listAccounts: mocks.listAccounts }));
vi.mock('$lib/server/db/queries/jev-settings', () => ({
	updateJevSettings: mocks.updateJevSettings
}));

import { POST } from './+server';

// `null` for signed out: `undefined` would pick up the default.
function call(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
	return POST({
		request: new Request('http://localhost/api/jev/settings', {
			method: 'POST',
			body: JSON.stringify(body)
		}),
		locals: { user: user ?? undefined }
	} as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.listAccounts.mockReturnValue([{ id: 'acct-1' }]);
	mocks.updateJevSettings.mockImplementation((_id: string, patch: object) => patch);
});

describe('POST /api/jev/settings', () => {
	it('saves the switch for one of the login’s own accounts', async () => {
		const res = await call({ accountId: 'acct-1', inboxTabs: true });
		expect(res.status).toBe(200);
		expect(mocks.listAccounts).toHaveBeenCalledWith('user-1');
		expect(mocks.updateJevSettings).toHaveBeenCalledWith('acct-1', { inboxTabs: true });
	});

	it('refuses an account that belongs to someone else', async () => {
		const res = await call({ accountId: 'acct-9', inboxTabs: true });
		expect(res.status).toBe(404);
		expect(mocks.updateJevSettings).not.toHaveBeenCalled();
	});

	it('requires a boolean', async () => {
		const res = await call({ accountId: 'acct-1', inboxTabs: 'yes' });
		expect(res.status).toBe(400);
		expect(mocks.updateJevSettings).not.toHaveBeenCalled();
	});

	it('requires a signed-in user', async () => {
		await expect(call({ accountId: 'acct-1', inboxTabs: true }, null)).rejects.toMatchObject({
			status: 401
		});
	});
});
