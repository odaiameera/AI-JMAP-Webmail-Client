import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { getIdentities } from '$lib/jmap/identities';
import { JMAPAuthError } from '$lib/jmap/client';
import { listAccounts, markNeedsReauth } from '$lib/server/auth/accounts';
import { unreadBadges } from '$lib/server/auth/unread-badges';
import { listLabels, migrateKeywordLabelsIfNeeded } from '$lib/server/labels';
import { syncIdentities } from '$lib/server/db/queries/identities';
import { loadRules } from '$lib/server/rules-store';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}
	if (!locals.auth) {
		// Logged into the webmail but no usable mail account: either none
		// linked yet (finish setup) or the active one needs re-auth.
		redirect(303, (locals.accounts?.length ?? 0) === 0 ? '/setup' : '/reauth');
	}

	try {
		const client = createClient(locals.auth);

		const accounts = locals.accounts ?? [];
		const activeAccount = accounts.find((a) => a.id === locals.activeAccountId);
		const userEmail = activeAccount?.email ?? '';

		const readingPane = cookies.get('reading_pane') ?? 'on';
		const theme = cookies.get('theme') ?? 'dark';
		const density = cookies.get('density') ?? 'comfortable';
		const displayName =
			cookies.get('display_name') ??
			activeAccount?.displayName ??
			userEmail.split('@')[0] ??
			'';

		// One-shot migration from keyword-based labels to JMAP mailbox labels.
		// Idempotent; the marker cookie makes subsequent loads a no-op. Must
		// finish before the label fetch below sees the mailboxes it creates.
		await migrateKeywordLabelsIfNeeded(client, locals.auth.accountId, userEmail, cookies);

		// Refresh the identity cache on every navigation. Single Identity/get
		// round-trip; the user picked "always refresh" over stale-while-
		// revalidate so the cache is never older than one page load. Failures
		// are non-fatal — a stale cache is better than a broken page.
		const identityRefresh = (async () => {
			try {
				const remote = await getIdentities(client, locals.auth!.accountId);
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
		})();

		// These hit the mail server independently — run them concurrently so
		// every navigation costs one round-trip's latency, not the sum of
		// three. This load re-runs on each invalidateAll(), so it's hot.
		const [mailboxes, labels, accountUnread] = await Promise.all([
			getMailboxes(client, locals.auth.accountId),
			listLabels(client, locals.auth.accountId, userEmail),
			// Inbox unread counts for the other accounts' switcher badges.
			// Cached server-side (30s) so navigations stay cheap.
			unreadBadges(listAccounts(locals.user.id), locals.activeAccountId),
			identityRefresh
		]);

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
			accounts,
			activeAccountId: locals.activeAccountId,
			activeAccountColor: activeAccount?.color ?? null,
			accountUnread,
			readingPaneDefault: readingPane === 'on',
			theme,
			density,
			displayName,
			labels,
			rules,
			folderExpanded,
			notificationsEnabled,
			notifyCalendarEvents,
			notifyEventReminders,
			// "Create event from email" (LLM extraction) only renders when an
			// Ollama endpoint is configured server-side.
			aiEnabled: !!(env.OLLAMA_API_KEY || env.OLLAMA_URL)
		};
	} catch (err) {
		if (err instanceof JMAPAuthError) {
			// The mail server rejected the stored credentials (password
			// changed). The webmail session stays valid — flag the account
			// and send the user to the reconnect page.
			if (locals.activeAccountId) markNeedsReauth(locals.activeAccountId);
			redirect(303, '/reauth');
		}
		throw err;
	}
};
