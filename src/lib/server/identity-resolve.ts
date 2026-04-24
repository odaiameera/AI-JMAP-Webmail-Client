import { listIdentities } from './db/queries/identities';

export interface ResolvedIdentity {
	id: string;
	email: string;
	name: string | null;
}

/**
 * Pick the JMAP identity to send / save / submit as. Cascade:
 *   1. The id explicitly chosen by the user (if it exists in cache)
 *   2. The cached primary
 *   3. First identity in the cache
 *   4. Synthetic identity built from the auth-header email (last resort
 *      if the cache is empty — happens on a brand-new install before
 *      the first layout sync; the `id` is empty which would fail an
 *      EmailSubmission/set, so callers should treat null returns as
 *      "skip submission" instead.)
 *
 * Returns null only if the cache is empty AND no fallback email was
 * provided.
 */
export function resolveIdentity(
	userEmail: string,
	requestedId: string | null | undefined,
	fallbackEmail: string
): ResolvedIdentity | null {
	const cache = listIdentities(userEmail);

	if (requestedId) {
		const match = cache.find((i) => i.jmapId === requestedId);
		if (match) return { id: match.jmapId, email: match.email, name: match.name };
	}

	const primary = cache.find((i) => i.isPrimary);
	if (primary) return { id: primary.jmapId, email: primary.email, name: primary.name };

	if (cache[0]) {
		return { id: cache[0].jmapId, email: cache[0].email, name: cache[0].name };
	}

	if (fallbackEmail) {
		// Cache is empty (e.g. layout hasn't synced yet). Synthesize the
		// minimum so callers can still build the email body; submission
		// will fail without a real identityId, which is the right
		// behaviour — better than silently sending as someone else.
		return { id: '', email: fallbackEmail, name: null };
	}
	return null;
}
