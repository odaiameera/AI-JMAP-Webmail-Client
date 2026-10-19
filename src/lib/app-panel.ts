import { getContext, onDestroy, untrack, type Snippet } from 'svelte';

/**
 * The left column of the app shell belongs to whichever app is open: Mail
 * shows its folders there, and Calendar, Contacts and Settings hand the shell
 * their own panel instead, so no screen ever stacks a second navigation
 * column beside the first. (On phones the same column is the slide-in
 * drawer.)
 *
 * A page or nested layout calls `hostAppPanel(snippet)` during init. The
 * snippet stays owned by the page, so it closes over the page's own state;
 * the shell only decides where it renders. The shell renders its content
 * before the column, so the panel is registered by the time the column is
 * reached and the server-rendered HTML already has it.
 */
export const APP_PANEL = Symbol('app-panel');

export type AppPanelContext = {
	set(panel: Snippet): void;
	clear(panel: Snippet): void;
	/** Close the phone drawer — for panel actions that aren't navigations. */
	closeDrawer(): void;
};

/**
 * Show `panel` in the shell's left column while the calling component is
 * mounted. Returns false when there is no shell (a component rendered on its
 * own, as in tests), so the caller can render the panel inline instead.
 */
export function hostAppPanel(panel: Snippet): boolean {
	const ctx = getContext<AppPanelContext | undefined>(APP_PANEL);
	if (!ctx) return false;
	// Registration happens while the shell is mid-render; untrack keeps it
	// from counting as a state write inside that render.
	untrack(() => ctx.set(panel));
	onDestroy(() => ctx.clear(panel));
	return true;
}

/**
 * Close the phone drawer after a choice made in a panel that doesn't
 * navigate (picking a contact list), the way following a link closes it.
 * Call during init; the returned function is a no-op without a shell.
 */
export function appDrawerCloser(): () => void {
	const ctx = getContext<AppPanelContext | undefined>(APP_PANEL);
	return () => ctx?.closeDrawer();
}
