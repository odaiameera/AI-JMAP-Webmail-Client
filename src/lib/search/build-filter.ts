import type { Token } from './parse';

export interface FilterContext {
	/** role (e.g. 'inbox') → JMAP mailbox id */
	mailboxesByRole: Record<string, string>;
	/** label slug (slugified displayName) → JMAP mailbox id */
	labelsBySlug: Record<string, string>;
	/** lowercased user folder name → JMAP mailbox id */
	foldersByName: Record<string, string>;
}

export type JmapFilter = Record<string, unknown>;

/**
 * Filter fragment that provably matches nothing. Used when the user
 * types `in:foo` or `label:foo` and we can't resolve it — an unknown
 * mailbox id makes Stalwart 500, so we substitute a self-contradicting
 * keyword filter instead. AND($seen, !$seen) = ∅, always.
 */
const MATCHES_NOTHING: JmapFilter = {
	operator: 'AND',
	conditions: [{ hasKeyword: '$seen' }, { notKeyword: '$seen' }]
};

function slugify(displayName: string): string {
	return (
		displayName
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 64) || 'untitled'
	);
}

function dayStartIso(date: string): string {
	return `${date}T00:00:00Z`;
}

function dayEndIso(date: string): string {
	// `before:` is inclusive of the given day — shift to next midnight so
	// messages received during the given date are included.
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function tokenToFilter(token: Token, ctx: FilterContext): JmapFilter | null {
	switch (token.kind) {
		case 'text':
			return { text: token.value };

		case 'flag':
			if (token.op === 'is') {
				if (token.value === 'unread') return { notKeyword: '$seen' };
				if (token.value === 'read') return { hasKeyword: '$seen' };
				if (token.value === 'starred') return { hasKeyword: '$flagged' };
			}
			if (token.op === 'has' && token.value === 'attachment') {
				return { hasAttachment: true };
			}
			return null;

		case 'field': {
			const { field, value } = token;
			if (field === 'from' || field === 'to' || field === 'cc' || field === 'subject' || field === 'body') {
				return { [field]: value };
			}
			if (field === 'before') return { before: dayEndIso(value) };
			if (field === 'after') return { after: dayStartIso(value) };
			if (field === 'in') {
				const lower = value.toLowerCase();
				const id = ctx.mailboxesByRole[lower] ?? ctx.foldersByName[lower];
				return id ? { inMailbox: id } : MATCHES_NOTHING;
			}
			if (field === 'label') {
				const id = ctx.labelsBySlug[slugify(value)];
				return id ? { inMailbox: id } : MATCHES_NOTHING;
			}
			return null;
		}

		case 'error':
			return null;
	}
}

export function buildJmapFilter(
	tokens: Token[],
	ctx: FilterContext
): JmapFilter | null {
	const conditions: JmapFilter[] = [];
	for (const t of tokens) {
		const f = tokenToFilter(t, ctx);
		if (f) conditions.push(f);
	}
	if (conditions.length === 0) return null;
	if (conditions.length === 1) return conditions[0]!;
	return { operator: 'AND', conditions };
}
