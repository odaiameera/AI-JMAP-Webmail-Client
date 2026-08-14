import type { AuthState, JMAPSession } from './types';
import { JMAPAuthError, JMAPClient, JMAPError } from './client';

export async function authenticate(baseUrl: string, email: string, password: string): Promise<AuthState> {
	const authHeader = `Basic ${btoa(`${email}:${password}`)}`;

	const response = await fetch(`${baseUrl}/jmap/session`, {
		headers: { Authorization: authHeader }
	});

	if (response.status === 401) {
		throw new JMAPAuthError('Invalid credentials');
	}

	if (!response.ok) {
		// Not an auth problem — a 404 here means the URL doesn't point at a
		// JMAP server. Keep it a plain Error so callers report it as such.
		throw new Error(`Mail server responded ${response.status} at ${baseUrl}/jmap/session`);
	}

	const session: JMAPSession = await response.json();
	const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];

	if (!accountId) {
		throw new JMAPAuthError('No mail account found');
	}

	// Stalwart returns its internal URL (e.g. http://host:8080/jmap/)
	// which isn't reachable externally. Use the baseUrl instead.
	const apiUrl = `${baseUrl}/jmap/`;
	return {
		authHeader,
		accountId,
		apiUrl,
		sessionState: session.state
	};
}

export async function fetchSession(auth: AuthState): Promise<JMAPSession> {
	const response = await fetch(new URL('session', auth.apiUrl).toString(), {
		headers: { Authorization: auth.authHeader }
	});
	if (response.status === 401 || response.status === 403) {
		throw new JMAPAuthError('Authentication failed');
	}
	if (!response.ok) {
		throw new JMAPError(`JMAP session request failed: ${response.status} ${response.statusText}`);
	}
	return response.json() as Promise<JMAPSession>;
}

export function createClient(auth: AuthState): JMAPClient {
	return new JMAPClient(auth.apiUrl, auth.authHeader);
}
