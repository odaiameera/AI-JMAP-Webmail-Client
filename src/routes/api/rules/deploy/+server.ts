import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildSieveContext, compileRulesToSieve } from '$lib/server/sieve';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import type { Rule } from '$lib/types/rules';

const JMAP_BASE = 'https://mx.odaiameera.com/jmap/';
const JMAP_USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:sieve'];

interface SieveScriptEntry {
	id: string;
	name: string;
}

interface JMAPMethodResponse {
	methodResponses: [string, Record<string, unknown>, string][];
}

async function jmapRequest(
	authHeader: string,
	methodCalls: unknown[]
): Promise<JMAPMethodResponse> {
	const res = await fetch(JMAP_BASE, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': authHeader
		},
		body: JSON.stringify({ using: JMAP_USING, methodCalls })
	});
	if (!res.ok) throw new Error(`JMAP error: ${res.status}`);
	return res.json();
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const { rules } = await request.json() as { rules: Rule[] };
	const { authHeader, accountId } = locals.auth;

	// Sieve needs to resolve applyLabel/moveToFolder action values (mailbox
	// ids, or legacy names for older rules) to IMAP mailbox names —
	// compileRulesToSieve can't do that without the current mailbox list.
	const client = createClient(locals.auth);
	const mailboxes = await getMailboxes(client, accountId);
	const script = compileRulesToSieve(rules, buildSieveContext(mailboxes));

	try {
		// Step 1: Upload script as blob
		const uploadRes = await fetch(
			`${JMAP_BASE}upload/${accountId}/`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/sieve',
					'Authorization': authHeader
				},
				body: script
			}
		);

		if (!uploadRes.ok) {
			const text = await uploadRes.text();
			return json({ error: `Upload failed: ${uploadRes.status} — ${text}`, script }, { status: 500 });
		}

		const { blobId } = await uploadRes.json() as { blobId: string };

		// Step 2: Check if mailrules script already exists
		const getRes = await jmapRequest(authHeader, [
			['SieveScript/get', { accountId, ids: null }, '0']
		]);

		const scriptList = (getRes.methodResponses[0][1] as { list: SieveScriptEntry[] }).list;
		const existingScript = scriptList.find((s) => s.name === 'mailrules');

		// Step 3: Create or update
		let methodCalls;
		if (existingScript) {
			methodCalls = [['SieveScript/set', {
				accountId,
				update: { [existingScript.id]: { blobId } }
			}, '0']];
		} else {
			methodCalls = [['SieveScript/set', {
				accountId,
				create: { script1: { name: 'mailrules', blobId } }
			}, '0']];
		}

		const setRes = await jmapRequest(authHeader, methodCalls);
		const result = setRes.methodResponses[0][1] as {
			created?: Record<string, unknown>;
			updated?: Record<string, unknown>;
			notCreated?: Record<string, { description: string }>;
			notUpdated?: Record<string, { description: string }>;
		};

		if (result.notCreated || result.notUpdated) {
			const errMap = result.notCreated ?? result.notUpdated ?? {};
			const err = Object.values(errMap)[0];
			return json({ error: err?.description ?? 'Sieve deploy failed', script }, { status: 500 });
		}

		return json({ success: true, script });
	} catch (err) {
		return json({
			error: err instanceof Error ? err.message : 'Deploy failed',
			script
		}, { status: 500 });
	}
};
