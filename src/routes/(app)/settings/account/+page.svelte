<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import type { SaveState } from '$lib/components/settings/SettingRow.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let displayName = $state(data.displayName);
	let displayNameState = $state<SaveState>('idle');

	let toastTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
	function flashSaved(setter: (s: SaveState) => void, key: string) {
		setter('saved');
		if (toastTimers[key]) clearTimeout(toastTimers[key]);
		toastTimers[key] = setTimeout(() => setter('idle'), 1800);
	}

	async function saveDisplayName() {
		displayNameState = 'saving';
		try {
			const res = await fetch('/api/preferences/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName })
			});
			if (!res.ok) { displayNameState = 'error'; return; }
			await invalidateAll();
			flashSaved((s) => displayNameState = s, 'displayName');
		} catch {
			displayNameState = 'error';
		}
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Account', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Account</h1>
	<p class="text-sm text-text-tertiary mt-1">Your identity and personal details.</p>
</header>

<section>
	<SettingRow
		title="Display name"
		description="Shown in outgoing emails and the header."
		state={displayNameState}
	>
		{#snippet control()}
			<input
				bind:value={displayName}
				onblur={saveDisplayName}
				onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
				placeholder="Your name"
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors w-[220px]"
			/>
		{/snippet}
	</SettingRow>

	<div class="mt-4 text-xs text-text-tertiary">
		Manage signatures on the
		<a href="/settings/signatures" class="text-accent hover:underline">Signatures</a> page.
	</div>
</section>
