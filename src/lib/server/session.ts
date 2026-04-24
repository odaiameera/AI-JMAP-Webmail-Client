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

/**
 * Returns one live auth per unique user email. The reminder scheduler uses
 * this to impersonate any logged-in user when processing due reminders.
 * Expired sessions are pruned as a side effect.
 *
 * Only returns sessions that are currently alive — users who closed the
 * tab but have an active browser SSE/session are still "alive", users who
 * let the 7-day TTL lapse are skipped and their reminders will sit in the
 * queue until they log back in.
 */
export function listActiveAuthsByUser(): Map<string, AuthState> {
	const out = new Map<string, AuthState>();
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (now - session.createdAt > SESSION_TTL) {
			sessions.delete(id);
			continue;
		}
		const decoded = Buffer.from(
			session.auth.authHeader.replace('Basic ', ''),
			'base64'
		).toString();
		const email = decoded.split(':')[0] ?? '';
		if (email && !out.has(email)) out.set(email, session.auth);
	}
	return out;
}
