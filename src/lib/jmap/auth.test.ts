import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSession } from './auth';
import { JMAPAuthError } from './client';
import type { AuthState, JMAPSession } from './types';

const auth: AuthState = {
	authHeader: 'Basic secret',
	accountId: 'mail-account',
	apiUrl: 'https://mail.example.test/jmap/',
	sessionState: ''
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchSession', () => {
	it('loads the authenticated JMAP session without exposing credentials to the browser', async () => {
		const session = { state: 'state-1' } as JMAPSession;
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(session), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchSession(auth)).resolves.toEqual(session);
		expect(fetchMock).toHaveBeenCalledWith('https://mail.example.test/jmap/session', {
			headers: { Authorization: 'Basic secret' }
		});
	});

	it.each([401, 403])('maps rejected account credentials (%s) to JMAPAuthError', async (status) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
		await expect(fetchSession(auth)).rejects.toBeInstanceOf(JMAPAuthError);
	});
});
