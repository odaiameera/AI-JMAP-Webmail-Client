import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Master-password hashing with node's built-in scrypt — no native addon to
 * compile in the Docker build. Parameters follow the OWASP recommendation
 * for scrypt (N=2^17, r=8, p=1) and are stored alongside the hash so they
 * can be raised later without invalidating existing rows.
 *
 * Format: `s2.N.r.p.salt.hash` with salt/hash base64url-encoded.
 */

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEYLEN = 32;

function b64u(buf: Buffer): string {
	return buf.toString('base64url');
}

export function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
	return `s2.${N}.${R}.${P}.${b64u(salt)}.${b64u(hash)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split('.');
	if (parts.length !== 6 || parts[0] !== 's2') return false;
	const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
	try {
		const salt = Buffer.from(saltB64, 'base64url');
		const expected = Buffer.from(hashB64, 'base64url');
		const actual = scryptSync(password, salt, expected.length, {
			N: Number(nStr),
			r: Number(rStr),
			p: Number(pStr),
			maxmem: 256 * 1024 * 1024
		});
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}
