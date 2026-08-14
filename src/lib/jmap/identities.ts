import type { JMAPClient } from './client';
import type { EmailAddress } from './types';

export interface JmapIdentity {
	id: string;
	email: string;
	name: string | null;
	replyTo: string | null;
}

interface RawIdentity {
	id: string;
	email: string;
	name?: string | null;
	replyTo?: EmailAddress[] | null;
}

/**
 * Pull every identity Stalwart has registered for this account. Used by
 * the From picker and the per-identity signature override settings page.
 *
 * Identities change rarely — adding a webmail alias is a Stalwart admin
 * action — so callers should cache. The (app) layout's load() runs this
 * on every page navigation and upserts the result into SQLite.
 */
export async function getIdentities(
	client: JMAPClient,
	accountId: string
): Promise<JmapIdentity[]> {
	const response = await client.request([
		['Identity/get', { accountId, ids: null }, '0']
	]);

	const result = response.methodResponses[0][1] as { list?: RawIdentity[] };
	const list = result.list ?? [];
	return list.map((i) => ({
		id: i.id,
		email: i.email,
		name: i.name ?? null,
		replyTo: i.replyTo?.[0]?.email ?? null
	}));
}
