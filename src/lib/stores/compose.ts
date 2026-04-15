import { writable } from 'svelte/store';

export interface ComposeData {
	to: string;
	cc: string;
	subject: string;
	body: string;
	inReplyTo?: string;
	references?: string;
	draftId?: string;
	isForward?: boolean;
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

// Full composer (reading pane slot)
export const fullComposeOpen = writable(false);
export const fullComposeData = writable<ComposeData | null>(null);

export function openFullCompose(data?: ComposeData) {
	fullComposeData.set(data ?? null);
	fullComposeOpen.set(true);
}

export function closeFullCompose() {
	fullComposeOpen.set(false);
	fullComposeData.set(null);
}

export function minimizeFullCompose() {
	let data: ComposeData | null = null;
	fullComposeData.subscribe((v) => { data = v; })();
	fullComposeOpen.set(false);
	fullComposeData.set(null);
	composeData.set(data);
	composeOpen.set(true);
}
