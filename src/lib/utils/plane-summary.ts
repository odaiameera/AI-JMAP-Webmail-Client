import TurndownService from 'turndown';

let cached: TurndownService | null = null;
function service(): TurndownService {
	if (cached) return cached;
	cached = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '_'
	});
	cached.remove(['script', 'style', 'head', 'meta', 'link']);
	return cached;
}

export interface PlaneSummaryInput {
	from: string;
	date: string;
	subject: string;
	bodyHtml: string;
}

function tidy(md: string): string {
	return md
		.replace(/ /g, ' ')
		.split('\n')
		.map((l) => l.replace(/\s+$/, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function buildPlaneSummary(input: PlaneSummaryInput): string {
	const bodyMd = tidy(service().turndown(input.bodyHtml));
	const lines = [
		`**From:** ${input.from}`,
		`**Date:** ${input.date}`,
		`**Subject:** ${input.subject}`,
		'',
		'---',
		''
	];
	if (bodyMd) lines.push(bodyMd);
	return lines.join('\n');
}
