const APP_NAME = 'ameera. Mail';

export interface PageTitleParts {
	page: string;
	/** Unread count — only appended when > 0. */
	count?: number;
	/** Optional middle segment, e.g. "Settings" for `Account · Settings — ameera. Mail`. */
	subtitle?: string;
}

export function pageTitle(parts: PageTitleParts): string {
	let title = parts.page;
	if (parts.count && parts.count > 0) {
		title += ` (${parts.count})`;
	}
	if (parts.subtitle) {
		title += ` · ${parts.subtitle}`;
	}
	return `${title} — ${APP_NAME}`;
}

export function truncateSubject(subject: string | null, max = 60): string {
	if (!subject) return '(no subject)';
	return subject.length > max ? subject.slice(0, max - 1) + '…' : subject;
}
