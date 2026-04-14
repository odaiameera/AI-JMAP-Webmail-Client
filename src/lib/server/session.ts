import type { AuthState } from '$lib/jmap/types';
import { randomUUID } from 'crypto';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredSession {
	auth: AuthState;
	createdAt: number;
}

const sessions = new Map<string, StoredSession>();

export function createSession(auth: AuthState): string {
	const id = randomUUID();
	sessions.set(id, { auth, createdAt: Date.now() });
	return id;
}

export function getSession(id: string): AuthState | undefined {
	const session = sessions.get(id);
	if (!session) return undefined;

	if (Date.now() - session.createdAt > SESSION_TTL) {
		sessions.delete(id);
		return undefined;
	}

	return session.auth;
}

export function deleteSession(id: string): void {
	sessions.delete(id);
}
