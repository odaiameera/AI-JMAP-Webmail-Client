import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ senderInContacts: vi.fn(), fetchSession: vi.fn() }));

vi.mock('$lib/jmap/auth', () => ({
	createClient: () => ({ client: true }),
	fetchSession: mocks.fetchSession
}));
vi.mock('$lib/server/trust-sender', () => ({ senderInContacts: mocks.senderInContacts }));

import { GET } from './+server';

function call(email: string | null, signedIn = true) {
	const url = new URL('https://mail.example.test/api/contacts/known');
	if (email !== null) url.searchParams.set('email', email);
	return GET({
		url,
		locals: signedIn ? { auth: { accountId: 'A1' } } : {}
	} as unknown as Parameters<typeof GET>[0]) as Promise<Response>;
}

beforeEach(() => {
	mocks.senderInContacts.mockReset();
	mocks.fetchSession.mockReset().mockResolvedValue({ session: true });
});

describe('GET /api/contacts/known', () => {
	it('answers whether the address is in the address book, without caching', async () => {
		mocks.senderInContacts.mockResolvedValue(true);
		const res = await call('Farah@Example.test');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ known: true });
		expect(res.headers.get('cache-control')).toContain('no-store');
		expect(mocks.senderInContacts).toHaveBeenCalledWith({ client: true }, { session: true }, 'Farah@Example.test');
	});

	it('says unknown (null) rather than failing when contacts are unavailable', async () => {
		mocks.fetchSession.mockRejectedValue(new Error('down'));
		expect(await (await call('a@b.test')).json()).toEqual({ known: null });
	});

	it('needs a session and an address', async () => {
		expect((await call('a@b.test', false)).status).toBe(401);
		expect((await call(null)).status).toBe(400);
		expect((await call('not-an-address')).status).toBe(400);
		expect(mocks.senderInContacts).not.toHaveBeenCalled();
	});
});
