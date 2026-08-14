import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Encryption for linked-account mail passwords (AES-256-GCM). The key is
 * derived via HKDF from the WEBMAIL_SECRET env var, which the operator
 * generates once (`openssl rand -base64 32`). Rotating the secret
 * invalidates stored credentials — accounts must be re-linked.
 *
 * Stored format: `iv.tag.ciphertext`, each part base64url-encoded.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
	if (cachedKey) return cachedKey;
	const secret = env.WEBMAIL_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error(
			'WEBMAIL_SECRET env var is required (32+ chars). Generate one with: openssl rand -base64 32'
		);
	}
	cachedKey = Buffer.from(hkdfSync('sha256', secret, 'ameera-webmail', 'mail-account-secrets', 32));
	return cachedKey;
}

/**
 * Validate WEBMAIL_SECRET (and pre-derive the key) so a misconfigured
 * deployment fails at boot with the message above, instead of surfacing
 * mid-flow as a confusing "can't reach the mail server" error.
 */
export function assertCryptoReady(): void {
	key();
}

export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
	const [ivB64, tagB64, ctB64] = stored.split('.');
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(ctB64, 'base64url')),
		decipher.final()
	]).toString('utf8');
}
