import type { Rule, RuleCondition, RuleAction, RuleConditionOp } from '$lib/types/rules';
import type { Mailbox } from '$lib/jmap/types';
import { LABEL_PREFIX } from '$lib/types/labels';

export interface AutoReplyConfig {
	enabled: boolean;
	subject: string;
	body: string;
}

export interface SieveContext {
	mailboxById: Map<string, Mailbox>;
	mailboxByName: Map<string, Mailbox>;
}

export function buildSieveContext(mailboxes: Mailbox[]): SieveContext {
	return {
		mailboxById: new Map(mailboxes.map((m) => [m.id, m])),
		mailboxByName: new Map(mailboxes.map((m) => [m.name, m]))
	};
}

export function compileRulesToSieve(
	rules: Rule[],
	ctx: SieveContext,
	autoReply?: AutoReplyConfig
): string {
	const activeRules = rules.filter((r) => r.enabled);
	const autoReplyActive = !!autoReply?.enabled && autoReply.body.trim().length > 0;

	// Nothing to emit — keep the minimum require line so the server still
	// parses the script cleanly.
	if (activeRules.length === 0 && !autoReplyActive) {
		return `require ["fileinto", "imap4flags", "envelope", "header"];\n\n# No active rules\n`;
	}

	// `copy` is required for `fileinto :copy` used by applyLabel.
	// `vacation` is required when we emit the auto-reply block.
	const requires = ['fileinto', 'imap4flags', 'envelope', 'header', 'body', 'copy'];
	if (autoReplyActive) requires.push('vacation');

	const lines: string[] = [
		`require [${requires.map((r) => `"${r}"`).join(', ')}];`,
		''
	];

	if (autoReplyActive && autoReply) {
		// Bare `vacation` with :days 1 rate-limits replies to the same sender
		// to once per day — the canonical vacation-auto-reply behavior.
		const subject = autoReply.subject.trim() || 'Out of office';
		lines.push('# Auto-reply (vacation)');
		lines.push(`vacation :days 1 :subject "${escSieve(subject)}" "${escSieve(autoReply.body)}";`);
		lines.push('');
	}

	for (const rule of activeRules) {
		lines.push(`# Rule: ${rule.name}`);

		const conditions = rule.conditions.map(compileCondition);
		let condBlock: string;
		if (rule.conditions.length === 1) {
			condBlock = conditions[0];
		} else {
			condBlock = `${rule.logic} (\n  ${conditions.join(',\n  ')}\n)`;
		}

		lines.push(`if ${condBlock} {`);
		for (const action of rule.actions) {
			const compiled = compileAction(action, ctx);
			if (compiled) lines.push(`  ${compiled}`);
		}
		lines.push(`}`);
		lines.push('');
	}

	return lines.join('\n');
}

function compileCondition(c: RuleCondition): string {
	let test = '';

	switch (c.field) {
		case 'from':
			test = opToSieve('header', 'From', c.op, c.value);
			break;
		case 'to':
			test = opToSieve('header', 'To', c.op, c.value);
			break;
		case 'subject':
			test = opToSieve('header', 'Subject', c.op, c.value);
			break;
		case 'body':
			test = `body :text :contains "${escSieve(c.value)}"`;
			break;
		case 'size':
			test = `size :over ${parseInt(c.value) * 1024}`;
			break;
		case 'hasAttachment':
			test = `header :contains "Content-Type" "multipart"`;
			break;
	}

	return c.negate ? `not ${test}` : test;
}

function opToSieve(type: string, header: string, op: RuleConditionOp, value: string): string {
	const v = escSieve(value);
	switch (op) {
		case 'contains':     return `${type} :contains "${header}" "${v}"`;
		case 'not_contains': return `not ${type} :contains "${header}" "${v}"`;
		case 'is':           return `${type} :is "${header}" "${v}"`;
		case 'starts_with':  return `${type} :matches "${header}" "${v}*"`;
		case 'ends_with':    return `${type} :matches "${header}" "*${v}"`;
		default:             return `${type} :contains "${header}" "${v}"`;
	}
}

/**
 * Resolve `action.value` to a mailbox — rules created from the new editor
 * use ids; older rules referenced mailboxes by name. Prefer id, fall back
 * to name.
 */
function resolveMailbox(value: string | undefined, ctx: SieveContext): Mailbox | null {
	if (!value) return null;
	return ctx.mailboxById.get(value) ?? ctx.mailboxByName.get(value) ?? null;
}

function compileAction(a: RuleAction, ctx: SieveContext): string {
	switch (a.type) {
		case 'moveToFolder': {
			const mb = resolveMailbox(a.value, ctx);
			if (!mb) return '';
			// `fileinto` moves by default — no `:copy`.
			return `fileinto "${escSieve(mb.name)}";`;
		}
		case 'applyLabel': {
			const mb = resolveMailbox(a.value, ctx);
			if (!mb || !mb.name.startsWith(LABEL_PREFIX)) return '';
			// `:copy` keeps the message in its original mailbox AND in the
			// label folder — the multi-mailbox membership model labels use.
			return `fileinto :copy "${escSieve(mb.name)}";`;
		}
		case 'markRead':       return `addflag "\\\\Seen";`;
		case 'markImportant':  return `addflag "\\\\Flagged";`;
		case 'delete':         return `discard; stop;`;
		case 'stopProcessing': return `stop;`;
		default:               return '';
	}
}

function escSieve(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
