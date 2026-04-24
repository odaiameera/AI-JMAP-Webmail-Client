import { writable } from 'svelte/store';

export type ComposerMode = 'popup' | 'fullscreen' | 'minimized' | 'closed';

export interface ComposeData {
	to: string;
	cc: string;
	subject: string;
	body: string;
	inReplyTo?: string;
	references?: string;
	draftId?: string;
	isForward?: boolean;
	fromIdentityId?: string | null;
}

export interface ComposerState extends ComposeData {
	mode: ComposerMode;
	signatureId: number | null;
	signatureManuallyChosen: boolean;
	fromIdentityId: string | null;
}

const defaultState: ComposerState = {
	to: '',
	cc: '',
	subject: '',
	body: '',
	mode: 'closed',
	signatureId: null,
	signatureManuallyChosen: false,
	fromIdentityId: null
};

export const composer = writable<ComposerState>(defaultState);

export function openCompose(init: Partial<ComposeData> = {}) {
	composer.set({
		...defaultState,
		...init,
		mode: 'popup',
		signatureId: null,
		signatureManuallyChosen: false,
		fromIdentityId: init.fromIdentityId ?? null
	});
}

export function closeCompose() {
	composer.set(defaultState);
}

export function setMode(mode: ComposerMode) {
	composer.update((s) => ({ ...s, mode }));
}

export function setSignature(id: number | null, manual = true) {
	composer.update((s) => ({ ...s, signatureId: id, signatureManuallyChosen: manual }));
}

export function setFromIdentity(identityId: string | null) {
	composer.update((s) => ({ ...s, fromIdentityId: identityId }));
}
