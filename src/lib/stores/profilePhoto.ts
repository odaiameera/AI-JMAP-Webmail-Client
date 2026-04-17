import { writable } from 'svelte/store';
import { clearAvatar, setAvatar, userState } from './userState';

/**
 * Thin compatibility layer over the new server-backed `userState.avatar`.
 * Pre-Phase-13 the profile photo was kept in localStorage with a slightly
 * different field shape (`url`, `offsetX`, `offsetY`); existing components
 * still expect that shape, so this store just reflects userState into the
 * legacy field names and forwards writes to the server.
 */
export interface ProfilePhotoState {
	url: string | null;
	zoom: number;
	/** Pan offset in px, relative to the 80×80 editor avatar's center. */
	offsetX: number;
	offsetY: number;
}

const DEFAULT_STATE: ProfilePhotoState = { url: null, zoom: 1, offsetX: 0, offsetY: 0 };

const { subscribe, set } = writable<ProfilePhotoState>(DEFAULT_STATE);

// Mirror userState.avatar into the legacy field shape. The userState
// store loads from /api/user-state/avatar in the layout's onMount;
// every subsequent update flows through here automatically.
userState.subscribe((s) => {
	if (s.avatar) {
		set({
			url: s.avatar.data,
			zoom: s.avatar.offset.zoom,
			offsetX: s.avatar.offset.x,
			offsetY: s.avatar.offset.y
		});
	} else {
		set(DEFAULT_STATE);
	}
});

export const profilePhoto = {
	subscribe,
	/** Kept for ProfileCard's onMount call. The actual hydration happens
	 *  via `loadUserState()` in the (app) layout — this is now a no-op. */
	hydrate(): void {},
	async save(url: string, zoom: number, offsetX: number, offsetY: number): Promise<void> {
		await setAvatar(url, { x: offsetX, y: offsetY, zoom });
	},
	async clear(): Promise<void> {
		await clearAvatar();
	}
};
