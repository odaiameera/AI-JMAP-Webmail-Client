import { writable } from 'svelte/store';

export interface ProfilePhotoState {
	url: string | null;
	zoom: number;
}

const STORAGE_KEY = 'profile_photo_v2';
const LEGACY_KEY = 'profile_photo';

const DEFAULT_STATE: ProfilePhotoState = { url: null, zoom: 1 };

function readFromStorage(): ProfilePhotoState {
	if (typeof localStorage === 'undefined') return DEFAULT_STATE;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as ProfilePhotoState;
			if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
				return { url: parsed.url, zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1 };
			}
		}
		// Migrate from legacy key (plain data URL)
		const legacy = localStorage.getItem(LEGACY_KEY);
		if (legacy) {
			const migrated: ProfilePhotoState = { url: legacy, zoom: 1 };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
			localStorage.removeItem(LEGACY_KEY);
			return migrated;
		}
	} catch {
		// ignore
	}
	return DEFAULT_STATE;
}

function createProfilePhotoStore() {
	const { subscribe, set } = writable<ProfilePhotoState>(DEFAULT_STATE);

	return {
		subscribe,
		/** Hydrate from localStorage. Call in onMount. */
		hydrate() {
			set(readFromStorage());
		},
		/** Commit a new photo + zoom to storage. */
		save(url: string, zoom: number) {
			const data: ProfilePhotoState = { url, zoom };
			set(data);
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
			}
		},
		/** Remove the saved photo. */
		clear() {
			set(DEFAULT_STATE);
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem(STORAGE_KEY);
				localStorage.removeItem(LEGACY_KEY);
			}
		}
	};
}

export const profilePhoto = createProfilePhotoStore();
