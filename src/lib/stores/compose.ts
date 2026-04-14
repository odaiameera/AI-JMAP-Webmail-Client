import { writable } from 'svelte/store';

export interface ComposeData {
	to: string;
	cc: string;
	subject: string;
	body: string;
	inReplyTo?: string;
	references?: string;
}

export const composeOpen = writable(false);
export const composeData = writable<ComposeData | null>(null);

export function openCompose(data?: ComposeData) {
	composeData.set(data ?? null);
	composeOpen.set(true);
}

export function closeCompose() {
	composeOpen.set(false);
	composeData.set(null);
}
