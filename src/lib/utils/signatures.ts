import { get } from 'svelte/store';
import { userState, type SignatureValue } from '$lib/stores/userState';

/**
 * Pick the signature to use for a given From address.
 * Phase 15: returns the default signature (or first available). Per-identity
 * mapping is Phase 16 — `fromEmail` is accepted now to keep the call site stable.
 */
export function resolveSignatureForFrom(_fromEmail: string): number | null {
	const { signatures } = get(userState);
	if (signatures.length === 0) return null;
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
