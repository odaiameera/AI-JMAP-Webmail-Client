import type { AuthState, JMAPSession } from './types';
import { JMAPAuthError, JMAPClient } from './client';

export async function authenticate(baseUrl: string, email: string, password: string): Promise<AuthState> {
	const authHeader = `Basic ${btoa(`${email}:${password}`)}`;

	const response = await fetch(`${baseUrl}/jmap/session`, {
		headers: { Authorization: authHeader }
	});

	if (response.status === 401) {
		throw new JMAPAuthError('Invalid credentials');
	}

	if (!response.ok) {
		throw new JMAPAuthError(`Authentication failed: ${response.status}`);
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

export function createClient(auth: AuthState): JMAPClient {
	return new JMAPClient(auth.apiUrl, auth.authHeader);
}
