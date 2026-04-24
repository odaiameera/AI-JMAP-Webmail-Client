import { get } from 'svelte/store';
import { userState, type SignatureValue } from '$lib/stores/userState';

/**
 * Pick the signature to use for a given identity. Cascade:
 *   1. Per-identity override (identity_signatures table)
 *   2. Global default (signatures.is_default = 1)
 *   3. First signature in the list
 *   4. null if there are no signatures at all
 *
 * Pass `null` for identityId when the composer doesn't know the from
 * identity yet (e.g. cache hasn't loaded) — the cascade still resolves
 * to the global default if one exists.
 */
export function resolveSignatureForIdentity(identityId: string | null): number | null {
	const { signatures, identitySignatures } = get(userState);
	if (signatures.length === 0) return null;

	if (identityId) {
		const overrideId = identitySignatures.get(identityId);
		if (overrideId !== undefined && signatures.some((s) => s.id === overrideId)) {
			return overrideId;
		}
	}

	const def = signatures.find((s) => s.isDefault);
	return (def ?? signatures[0]).id;
}

export function getSignatureById(id: number | null): SignatureValue | null {
	if (id === null) return null;
	const { signatures } = get(userState);
	return signatures.find((s) => s.id === id) ?? null;
}

/**
 * Replace any existing signature block in `bodyHtml` with `signatureHtml`,
 * or strip it entirely if `signatureHtml` is null. We mark the block with
 * a class (`ameera-signature`) instead of an HTML comment because Tiptap's
 * ProseMirror schema strips comments on setContent.
 */
// Match the signature block plus any leading or trailing empty <p>…</p>
// scaffolding that ProseMirror tacks on around block nodes.
const SIG_BLOCK_RE =
	/(?:<p[^>]*>\s*(?:<br[^>]*\/?>)?\s*<\/p>\s*)?<div class="ameera-signature">[\s\S]*?<\/div>(?:\s*<p[^>]*>(?:\s|<br[^>]*\/?>)*<\/p>)*\s*/gi;

export function applySignature(bodyHtml: string, signatureHtml: string | null): string {
	const stripped = bodyHtml.replace(SIG_BLOCK_RE, '').trimEnd();
	if (!signatureHtml) return stripped;
	// Always include a leading empty paragraph so the cursor has a writable
	// landing spot above the signature — otherwise a fresh compose opens with
	// the cursor stuck inside the signature wrapper.
	return `${stripped}<p></p><div class="ameera-signature">${signatureHtml}</div>`;
}
