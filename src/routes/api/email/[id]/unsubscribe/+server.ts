import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { sendEmail } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';

interface UnsubscribeBody {
	mode: 'one-click' | 'mailto';
	url?: string;
	mailto?: string;
}

/**
 * Best-effort unsubscribe endpoint.
 *
 *  - `one-click` (RFC 8058): server-side POSTs
 *    `List-Unsubscribe=One-Click` to the sender's HTTPS URL. This has to
 *    happen server-side because browsers can't make CORS-less POSTs.
 *  - `mailto`: sends an empty (or mailto-specified) message from the
 *    user's identity via the existing sendEmail pipeline. We hand-roll
 *    the compose rather than bouncing through /api/send so we can honor
 *    `?subject=` and `?body=` params on the mailto URI.
 *
 * On success, we flag the source email with the `$unsubscribed` keyword
 * so the UI can show a persistent "Unsubscribed" state across reloads.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	let body: UnsubscribeBody;
	try {
		body = (await request.json()) as UnsubscribeBody;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const client = createClient(locals.auth);
	const accountId = locals.auth.accountId;

	try {
		if (body.mode === 'one-click') {
			if (!body.url) return json({ error: 'url required' }, { status: 400 });

			let target: URL;
			try {
				target = new URL(body.url);
			} catch {
				return json({ error: 'Invalid unsubscribe URL' }, { status: 400 });
			}
			if (target.protocol !== 'https:') {
				// RFC 8058 one-click is only meaningful over HTTPS.
				return json({ error: 'One-click requires HTTPS' }, { status: 400 });
			}

			const res = await fetch(target.toString(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: 'List-Unsubscribe=One-Click',
				signal: AbortSignal.timeout(15_000)
			});
			if (!res.ok) {
				return json({ error: `Sender returned ${res.status}` }, { status: 502 });
			}
		} else if (body.mode === 'mailto') {
			if (!body.mailto) return json({ error: 'mailto required' }, { status: 400 });

			const parsed = parseMailto(body.mailto);
			if (!parsed) return json({ error: 'Invalid mailto URI' }, { status: 400 });

			const mailboxes = await getMailboxes(client, accountId);
			const sent = mailboxes.find((m) => m.role === 'sent');
			if (!sent) return json({ error: 'Sent folder missing' }, { status: 500 });

			const senderEmail = getSenderEmail(locals.auth.authHeader);

			const result = await sendEmail(
				client,
				accountId,
				{
					from: { name: null, email: senderEmail },
					to: [{ name: null, email: parsed.to }],
					cc: [],
					subject: parsed.subject ?? 'unsubscribe',
					body: parsed.body ?? ''
				},
				sent.id
			);

			if (!result.success) {
				return json({ error: result.error ?? 'Send failed' }, { status: 502 });
			}
		} else {
			return json({ error: 'Invalid unsubscribe mode' }, { status: 400 });
		}

		// Flag the email locally so the UI can show "Unsubscribed" persistently.
		await client.request([
			[
				'Email/set',
				{
					accountId,
					update: { [params.id]: { 'keywords/$unsubscribed': true } }
				},
				'0'
			]
		]);

		return json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unsubscribe failed';
		// Timeout from AbortSignal.timeout surfaces as AbortError.
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			return json({ error: 'Sender did not respond in time' }, { status: 504 });
		}
		return json({ error: message }, { status: 500 });
	}
};

/**
 * Parse a `mailto:` URI, honoring `?subject=` and `?body=` parameters.
 * Returns null on malformed input.
 */
function parseMailto(mailto: string): { to: string; subject?: string; body?: string } | null {
	const m = mailto.match(/^mailto:([^?]+)(?:\?(.*))?$/i);
	if (!m) return null;
	const to = decodeURIComponent(m[1]).trim();
	if (!to.includes('@')) return null;
	const params = new URLSearchParams(m[2] ?? '');
	return {
		to,
		subject: params.get('subject') ?? undefined,
		body: params.get('body') ?? undefined
	};
}

/** Decode the Basic auth header to extract the user's email address. */
function getSenderEmail(authHeader: string): string {
	const decoded = Buffer.from(authHeader.replace(/^Basic\s+/i, ''), 'base64').toString();
	return decoded.split(':')[0];
}
