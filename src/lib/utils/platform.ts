/**
 * Keyboard-hint labels for the platform the app is running on. Hints were
 * hard-coded as ⌘, which is wrong everywhere but Apple devices.
 */
export function isApplePlatform(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
	return isApplePlatform() ? '⌘' : 'Ctrl';
}

/** A shortcut hint like "⌘K" / "Ctrl+K", or "⌘↵" / "Ctrl+Enter". */
export function shortcutLabel(key: string): string {
	if (isApplePlatform()) return `⌘${key === 'Enter' ? '↵' : key}`;
	return `Ctrl+${key}`;
}
