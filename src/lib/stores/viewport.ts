import { readable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * The phone layout: anything narrower than Tailwind's `md` breakpoint
 * (768px). Kept in step with the `max-md:` / `md:` classes so CSS and script
 * agree on where the layout switches.
 *
 * Layout itself is done in CSS, so the first server-rendered paint is already
 * right on a phone. This store is only for behaviour CSS can't express —
 * whether a row click opens the reading pane or navigates, whether the
 * sidebar is a drawer. It starts false on the server and settles on mount.
 */
export const PHONE_QUERY = '(max-width: 767.98px)';

export const isPhone = readable(false, (set) => {
	// jsdom (the component tests) has no matchMedia.
	if (!browser || typeof window.matchMedia !== 'function') return;
	const mq = window.matchMedia(PHONE_QUERY);
	set(mq.matches);
	const onChange = (e: MediaQueryListEvent) => set(e.matches);
	mq.addEventListener('change', onChange);
	return () => mq.removeEventListener('change', onChange);
});
