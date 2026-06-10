import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { getIdentities } from '$lib/jmap/identities';
import { JMAPAuthError } from '$lib/jmap/client';
import { deleteSession } from '$lib/server/session';
import { listLabels, migrateKeywordLabelsIfNeeded } from '$lib/server/labels';
import { syncIdentities } from '$lib/server/db/queries/identities';
import { loadRules } from '$lib/server/rules-store';

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

		// One-shot migration from keyword-based labels to JMAP mailbox labels.
		// Idempotent; the marker cookie makes subsequent loads a no-op.
		await migrateKeywordLabelsIfNeeded(client, locals.auth.accountId, userEmail, cookies);
		const labels = await listLabels(client, locals.auth.accountId, userEmail);

		// Refresh the identity cache on every navigation. Single Identity/get
		// round-trip; the user picked "always refresh" over stale-while-
		// revalidate so the cache is never older than one page load. Failures
		// are non-fatal — a stale cache is better than a broken page.
		try {
			const remote = await getIdentities(client, locals.auth.accountId);
			const primaryByEmail = remote.find(
				(r) => r.email.toLowerCase() === userEmail.toLowerCase()
			);
			const primaryId = primaryByEmail?.id ?? remote[0]?.id;
			syncIdentities(
				userEmail,
				remote.map((r) => ({
					jmapId: r.id,
					email: r.email,
					name: r.name,
					replyTo: r.replyTo,
					isPrimary: r.id === primaryId
				}))
			);
		} catch (err) {
			console.warn('[identities] sync failed; using cached values', err);
		}

		// Rules live in SQLite now (device-independent). loadRules also performs
		// the one-time import from the legacy per-browser `mail_rules` cookie.
		const rules = loadRules(userEmail, cookies);

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

		// Notification prefs are surfaced here (not just in the settings
		// layout) so the realtime layer can decide whether to fire desktop
		// notifications for new mail without a second round-trip.
		const notificationsEnabled = cookies.get('notifications') === 'on';
		// Calendar notification channels default to on once the master
		// toggle is enabled; users opt out per-channel.
		const notifyCalendarEvents = cookies.get('notify_calendar_events') !== 'off';
		const notifyEventReminders = cookies.get('notify_event_reminders') !== 'off';

		return {
			mailboxes,
			accountId: locals.auth.accountId,
			userEmail,
			readingPaneDefault: readingPane === 'on',
			theme,
			density,
			displayName,
			labels,
			rules,
			folderExpanded,
			notificationsEnabled,
			notifyCalendarEvents,
			notifyEventReminders
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
