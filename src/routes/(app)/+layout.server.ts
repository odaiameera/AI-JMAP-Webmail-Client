import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { JMAPAuthError } from '$lib/jmap/client';
import { deleteSession } from '$lib/server/session';
import { listLabels, migrateKeywordLabelsIfNeeded } from '$lib/server/labels';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);

		const decoded = Buffer.from(locals.auth.authHeader.replace('Basic ', ''), 'base64').toString();
		const userEmail = decoded.split(':')[0];

		const readingPane = cookies.get('reading_pane') ?? 'on';
		const theme = cookies.get('theme') ?? 'dark';
		const density = cookies.get('density') ?? 'comfortable';
		const displayName = cookies.get('display_name') ?? 'Odai Ameera';
		const rawSignature = cookies.get('signature');
		const signature = rawSignature ? decodeURIComponent(rawSignature) : '';

		// One-shot migration from keyword-based labels to JMAP mailbox labels.
		// Idempotent; the marker cookie makes subsequent loads a no-op.
		await migrateKeywordLabelsIfNeeded(client, locals.auth.accountId, cookies);
		const labels = await listLabels(client, locals.auth.accountId, cookies);

		const rawRules = cookies.get('mail_rules');
		const rules = rawRules ? JSON.parse(decodeURIComponent(rawRules)) : [];

		// Sidebar expand/collapse state — Record<id, boolean>. Absence means
		// "default": section headers expanded, individual folders collapsed.
		let folderExpanded: Record<string, boolean> = {};
		const rawExpanded = cookies.get('folder_expanded');
		if (rawExpanded) {
			try {
				const parsed = JSON.parse(decodeURIComponent(rawExpanded));
				if (parsed && typeof parsed === 'object') folderExpanded = parsed;
			} catch {
				// Ignore malformed cookie.
			}
		}

		return {
			mailboxes,
			accountId: locals.auth.accountId,
			userEmail,
			readingPaneDefault: readingPane === 'on',
			theme,
			density,
			displayName,
			signature,
			labels,
			rules,
			folderExpanded
		};
	} catch (err) {
		if (err instanceof JMAPAuthError) {
			const sessionId = cookies.get('session');
			if (sessionId) deleteSession(sessionId);
			cookies.delete('session', { path: '/' });
			redirect(303, '/login');
		}
		throw err;
	}
};
