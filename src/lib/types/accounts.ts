/**
 * Client-safe shape of a linked mail account (no secret material).
 * Server code maps mail_accounts rows to this via toPublic().
 */
export interface LinkedAccount {
	id: string;
	email: string;
	displayName: string | null;
	color: string;
	needsReauth: boolean;
}
