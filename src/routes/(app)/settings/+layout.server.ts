import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

function num(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const n = parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Load every preference cookie the settings pages care about, plus the
 * Stalwart self-service portal URL used by the "Security" section.
 * `parent()` gives us the mailboxes/labels/rules already loaded by the
 * (app) layout so child sections don't re-fetch.
 */
export const load: LayoutServerLoad = async ({ cookies, parent }) => {
	const { mailboxes, labels, rules } = await parent();

	let notificationFolders: string[] = ['inbox'];
	try {
		const raw = cookies.get('notification_folders');
		if (raw) {
			const parsed = JSON.parse(decodeURIComponent(raw));
			if (Array.isArray(parsed)) notificationFolders = parsed;
		}
	} catch {
		// keep default
	}

	return {
		// Account / identity
		displayName: cookies.get('display_name') ?? '',
		signature: decodeURIComponent(cookies.get('signature') ?? ''),
		// Appearance
		theme: cookies.get('theme') ?? 'dark',
		density: cookies.get('density') ?? 'comfortable',
		readingPane: cookies.get('reading_pane') ?? 'on',
		// Composer
		composerFont: cookies.get('composer_font') ?? 'Calibri',
		composerFontSize: cookies.get('composer_font_size') ?? '12',
		undoSendSeconds: num(cookies.get('undo_send'), 0),
		autoSaveInterval: num(cookies.get('autosave_interval'), 10),
		// Mail
		conversationView: cookies.get('conversation_view') === 'on',
		markReadDelay: num(cookies.get('mark_read_delay'), 1000),
		autoLoadImages: cookies.get('auto_load_images') ?? 'contacts_only',
		defaultSort: cookies.get('default_sort') ?? 'date_desc',
		keyboardShortcuts: cookies.get('keyboard_shortcuts') !== 'off',
		// Notifications
		notificationsEnabled: cookies.get('notifications') === 'on',
		notificationFolders,
		// Auto-reply
		autoReplyEnabled: cookies.get('auto_reply_enabled') === 'on',
		autoReplySubject: decodeURIComponent(cookies.get('auto_reply_subject') ?? ''),
		autoReplyBody: decodeURIComponent(cookies.get('auto_reply_body') ?? ''),
		// Link-out
		stalwartPortalUrl: env.STALWART_PORTAL_URL ?? 'https://mx.odaiameera.com/webadmin',
		// Piped through for section pages that need them
		mailboxes,
		labels,
		rules
	};
};
