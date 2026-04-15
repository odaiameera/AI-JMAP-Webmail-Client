import type { Rule, RuleCondition, RuleAction, RuleConditionOp } from '$lib/types/rules';

export function compileRulesToSieve(rules: Rule[]): string {
	const activeRules = rules.filter(r => r.enabled);
	if (activeRules.length === 0) {
		return `require ["fileinto", "imap4flags", "envelope", "header"];\n\n# No active rules\n`;
	}

	const lines: string[] = [
		`require ["fileinto", "imap4flags", "envelope", "header", "body"];`,
		''
	];

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
			const compiled = compileAction(action);
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

function compileAction(a: RuleAction): string {
	switch (a.type) {
		case 'moveToFolder':   return `fileinto "${escSieve(a.value ?? 'INBOX')}"; stop;`;
		case 'applyLabel':     return `addflag "${escSieve(a.value ?? '')}";`;
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
