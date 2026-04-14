import { writable } from 'svelte/store';

export function createReadingPaneStore(initial: boolean) {
	const { subscribe, set, update } = writable(initial);
	let hasManualPreference = initial !== undefined;

	return {
		subscribe,
		async toggle() {
			let next = false;
			update((v) => {
				next = !v;
				return next;
			});
			hasManualPreference = true;
			await fetch('/api/preferences/reading-pane', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ value: next ? 'on' : 'off' })
			});
		},
		setFromViewport(width: number) {
			if (hasManualPreference) return;
			set(width >= 1280);
		}
	};
}
