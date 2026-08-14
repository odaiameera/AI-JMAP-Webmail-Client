/**
 * CalDAV calendar-home resolution: the conventional /dav/cal/{email}/ path is
 * kept when the server answers it, and RFC 6764 discovery heals the path when
 * it doesn't (the "login name ≠ email" case that broke the calendar entirely).
 *
 * Run via: npm run test:caldav  (bundles caldav.ts → .test-build/caldav.mjs)
 */
import { spawn } from 'node:child_process';
import { resolveCalendarHome } from '../.test-build/caldav.mjs';

const MOCK = 'http://127.0.0.1:8222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = 0;
const expect = (name, ok, detail = '') => {
	console.log(`${ok ? '  ✓' : '✗ FAIL'} ${name}${ok ? '' : `  → ${detail}`}`);
	if (!ok) fail++;
};

// The mock listens on :8200; run a second copy on :8222 to stay isolated.
const mock = spawn('node', ['/tmp/mock-stalwart.mjs'], {
	env: { ...process.env, MOCK_PORT: '8222' },
	stdio: ['ignore', 'pipe', 'pipe']
});
mock.stderr.on('data', (d) => process.stderr.write(`[mock] ${d}`));
for (let i = 0; i < 40; i++) {
	await sleep(100);
	try {
		await fetch(`${MOCK}/jmap/session`);
		break;
	} catch {
		/* not up yet */
	}
}

const mockAuth = {
	authHeader: `Basic ${Buffer.from('user@example.test:test-password').toString('base64')}`,
	accountId: 'acc1',
	apiUrl: `${MOCK}/jmap/`,
	sessionState: ''
};

try {
	// 1. Conventional path answers → kept verbatim (no behavior change for
	//    working deployments).
	const kept = await resolveCalendarHome(mockAuth, 'user@example.test');
	expect('constructed home kept when it answers', kept === '/dav/cal/user%40example.test/', kept);

	// 2. Conventional path 404s (email ≠ DAV principal) → discovery resolves
	//    the real home via current-user-principal → calendar-home-set.
	const healed = await resolveCalendarHome(mockAuth, 'mismatch@example.test');
	expect(
		'discovery heals a non-conventional principal path',
		healed === '/dav/cal/user%40example.test/',
		healed
	);
} catch (err) {
	expect('test ran without throwing', false, err.message);
} finally {
	mock.kill();
}

console.log(fail ? `\n${fail} check(s) FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
