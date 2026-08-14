import { writable } from 'svelte/store';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: string;
	message: string;
	action?: ToastAction;
	/** Auto-dismiss after this many ms. Pass 0 to keep open until dismissed. */
	duration?: number;
}

export const toasts = writable<Toast[]>([]);

export function showToast(toast: Omit<Toast, 'id'>): string {
	const id =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const full: Toast = { duration: 4000, ...toast, id };
	toasts.update((list) => [...list, full]);
	if (full.duration && full.duration > 0) {
		setTimeout(() => dismissToast(id), full.duration);
	}
	return id;
}

export function dismissToast(id: string): void {
	toasts.update((list) => list.filter((t) => t.id !== id));
}
