export interface EmailAddress {
	name: string | null;
	email: string;
}

export interface JMAPSession {
	apiUrl: string;
	downloadUrl: string;
	uploadUrl: string;
	eventSourceUrl: string;
	primaryAccounts: Record<string, string>;
	accounts: Record<string, { name: string; isPersonal: boolean; isReadOnly: boolean }>;
	capabilities: Record<string, unknown>;
	state: string;
}

export type MethodCall = [string, Record<string, unknown>, string];

export interface JMAPRequest {
	using: string[];
	methodCalls: MethodCall[];
}

export interface JMAPResponse {
	methodResponses: [string, Record<string, unknown>, string][];
	sessionState: string;
}

export interface Mailbox {
	id: string;
	name: string;
	role: string | null;
	sortOrder: number;
	totalEmails: number;
	unreadEmails: number;
	parentId: string | null;
}

export interface Email {
	id: string;
	blobId: string;
	threadId: string;
	mailboxIds: Record<string, boolean>;
	from: EmailAddress[] | null;
	to: EmailAddress[] | null;
	cc: EmailAddress[] | null;
	subject: string | null;
	receivedAt: string;
	size: number;
	preview: string;
	keywords: Record<string, boolean>;
	hasAttachment: boolean;
	bodyValues?: Record<string, { value: string; isEncodingProblem: boolean; isTruncated: boolean }>;
	htmlBody?: Array<{ partId: string; blobId: string; type: string; name: string | null }>;
	textBody?: Array<{ partId: string; blobId: string; type: string; name: string | null }>;
	'header:list-unsubscribe:asText'?: string | null;
}

export interface EmailQueryResult {
	emails: Email[];
	total: number;
}

export interface ComposeEmail {
	from: EmailAddress;
	to: EmailAddress[];
	cc: EmailAddress[];
	subject: string;
	body: string;
	inReplyTo?: string;
	references?: string;
}

export interface AuthState {
	authHeader: string;
	accountId: string;
	apiUrl: string;
	sessionState: string;
}
