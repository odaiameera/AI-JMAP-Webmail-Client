import { readable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Current wall-clock time, refreshed once a minute. Subscribe to this
 * anywhere a label depends on "time since X" or "is today/yesterday" so
 * those labels roll forward automatically — otherwise a message
 * timestamped "3 mins ago" still reads "3 mins ago" an hour later.
 *
 * On the server we return a one-shot value; the minute tick only runs in
 * the browser.
 */
export const now = readable<number>(Date.now(), (set) => {
	if (!browser) return;
	const id = setInterval(() => set(Date.now()), 60_000);
	return () => clearInterval(id);
});
