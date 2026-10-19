import type { Email, EmailAddress } from '$lib/jmap/types';

/**
 * Addressing and threading for Reply, Reply all and Forward, kept pure so
 * the rules are testable apart from the message view.
 */

const norm = (address: string) => address.trim().toLowerCase();

/** "Re: …" / "Fwd: …" without stacking prefixes the subject already has. */
export function prefixedSubject(subject: string | null | undefined, kind: 'reply' | 'forward'): string {
	const s = (subject ?? '').trim();
	if (kind === 'reply') return /^(re|aw|sv|antw):/i.test(s) ? s : `Re: ${s}`;
	return /^(fwd?|wg|tr):/i.test(s) ? s : `Fwd: ${s}`;
}

/**
 * In-Reply-To and References for a reply, from the original's Message-ID
 * headers (RFC 5322 §3.6.4): the parent's References — or, lacking those,
 * its In-Reply-To — followed by the parent's own Message-ID. These used to
 * be the JMAP email id, which no other mail client can thread on.
 */
export function threadHeaders(email: Pick<Email, 'messageId' | 'inReplyTo' | 'references'>): {
	inReplyTo: string;
	references: string;
} {
	const id = email.messageId?.[0] ?? '';
	const chain = [...(email.references?.length ? email.references : (email.inReplyTo ?? []))];
	if (id && !chain.includes(id)) chain.push(id);
	return { inReplyTo: id, references: chain.join(' ') };
}

function unique(list: EmailAddress[], exclude: Set<string>): EmailAddress[] {
	const seen = new Set(exclude);
	const out: EmailAddress[] = [];
	for (const a of list) {
		const key = norm(a.email);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(a);
	}
	return out;
}

/**
 * Who a reply goes to. Reply goes to Reply-To when the sender set one, else
 * the sender. Replying to your own message (from Sent) goes back to the
 * people you wrote to. Reply all adds everyone else on the message, never
 * your own addresses, and never someone already on To.
 */
export function replyRecipients(
	email: Pick<Email, 'from' | 'to' | 'cc' | 'replyTo'>,
	myAddresses: string[],
	all: boolean
): { to: EmailAddress[]; cc: EmailAddress[] } {
	const mine = new Set(myAddresses.map(norm).filter(Boolean));
	const sender = email.from?.[0];
	const fromMe = !!sender && mine.has(norm(sender.email));

	const primary = fromMe
		? (email.to ?? [])
		: email.replyTo?.length
			? email.replyTo
			: sender
				? [sender]
				: [];
	let to = unique(primary, mine);
	// A note to yourself: the reply still needs somewhere to go.
	if (to.length === 0 && sender) to = [sender];

	const cc = all
		? unique([...(fromMe ? [] : (email.to ?? [])), ...(email.cc ?? [])], new Set([...mine, ...to.map((a) => norm(a.email))]))
		: [];
	return { to, cc };
}

export function addressList(list: EmailAddress[]): string {
	return list.map((a) => a.email).join(', ');
}

/** Text from a message, safe to put inside the HTML of a quoted header. */
export function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
