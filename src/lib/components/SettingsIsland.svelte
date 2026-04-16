<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import type { Label } from '$lib/types/labels';
	import type { Rule } from '$lib/types/rules';
	import type { Mailbox } from '$lib/jmap/types';

	/**
	 * The island is now a small quick-toggle palette — theme and density
	 * with a prominent link into /settings for everything else. All the
	 * inline editors (labels, rules, account fields) moved to the full
	 * settings app in Phase 8.
	 */

	let { onClose, initialTheme, density: initialDensity = 'comfortable' }: {
		onClose: () => void;
		initialTheme: string;
		density?: string;
		// Accepted for backwards compat with call sites that still pass them;
		// the island itself no longer consumes these.
		displayName?: string;
		signature?: string;
		labels?: Label[];
		rules?: Rule[];
		mailboxes?: Mailbox[];
	} = $props();

	let theme = $state(initialTheme);
	let density = $state(initialDensity);

	async function setLightTheme(isLight: boolean) {
		const next = isLight ? 'light' : 'dark';
		theme = next;
		document.documentElement.classList.toggle('light', isLight);
		await fetch('/api/preferences/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: next })
		});
	}

	async function setDensity(next: string) {
		density = next;
		await fetch('/api/preferences/density', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: next })
		});
		await invalidateAll();
	}

	function openFullSettings() {
		onClose();
		goto('/settings');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] overflow-hidden
		bg-surface border border-border rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.5)] animate-compose-modal-in"
>
	<div class="flex items-center justify-between px-5 py-4 border-b border-border">
		<h2 class="text-base font-semibold text-text">Quick settings</h2>
		<button
			onclick={onClose}
			title="Close"
			aria-label="Close quick settings"
			class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>

	<div class="px-5 py-4 flex flex-col gap-4">
		<!-- Theme -->
		<div class="flex items-center justify-between">
			<div>
				<p class="text-sm text-text font-medium">Light mode</p>
				<p class="text-xs text-text-tertiary mt-0.5">{theme === 'light' ? 'On' : 'Off — dark mode'}</p>
			</div>
			<Toggle checked={theme === 'light'} onChange={setLightTheme} />
		</div>

		<!-- Density -->
		<div class="flex items-center justify-between">
			<div>
				<p class="text-sm text-text font-medium">Density</p>
				<p class="text-xs text-text-tertiary mt-0.5">How tightly rows pack.</p>
			</div>
			<div class="flex rounded-lg border border-border overflow-hidden">
				<button
					onclick={() => setDensity('comfortable')}
					class="px-2.5 py-1 text-xs transition-colors cursor-pointer {density === 'comfortable' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}"
				>Comfortable</button>
				<button
					onclick={() => setDensity('compact')}
					class="px-2.5 py-1 text-xs border-l border-border transition-colors cursor-pointer {density === 'compact' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}"
				>Compact</button>
			</div>
		</div>
	</div>

	<div class="border-t border-border p-2">
		<button
			onclick={openFullSettings}
			class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-text hover:bg-surface-hover transition-colors cursor-pointer"
		>
			<span class="font-medium">Open full settings</span>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary">
				<polyline points="9 18 15 12 9 6"/>
			</svg>
		</button>
	</div>
</div>
