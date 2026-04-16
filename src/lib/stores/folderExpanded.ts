import { writable } from 'svelte/store';

export type FolderExpandedMap = Record<string, boolean>;

/** Special keys for the two top-level sidebar sections. */
export const SECTION_FOLDERS = '__section:folders';
export const SECTION_LABELS = '__section:labels';

/** Section headers default to expanded; individual tree nodes default to collapsed. */
export function isExpandedDefault(id: string, map: FolderExpandedMap): boolean {
	if (id in map) return map[id];
	if (id.startsWith('__section:')) return true;
	return false;
}

/**
 * Writable store backing the sidebar expand/collapse state. Each toggle
 * fires a fire-and-forget POST so the cookie stays in sync — collapsing
 * the sidebar rapidly is fine; last-write-wins.
 */
export function createFolderExpandedStore(initial: FolderExpandedMap) {
	const { subscribe, update } = writable<FolderExpandedMap>({ ...initial });

	function persist(value: FolderExpandedMap) {
		// Fire-and-forget — the UI has already updated optimistically.
		fetch('/api/preferences/folder-expanded', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value })
		}).catch(() => {
			// Network failures are non-fatal; the user still sees the in-memory
			// state and the next toggle will try again.
		});
	}

	return {
		subscribe,
		toggle(id: string) {
			update((m) => {
				const current = isExpandedDefault(id, m);
				const next = { ...m, [id]: !current };
				persist(next);
				return next;
			});
		},
		set(id: string, value: boolean) {
			update((m) => {
				const next = { ...m, [id]: value };
				persist(next);
				return next;
			});
		}
	};
}
