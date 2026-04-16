<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import type { SaveState } from '$lib/components/settings/SettingRow.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let displayName = $state(data.displayName);
	let signature = $state(data.signature);

	let displayNameState = $state<SaveState>('idle');
	let signatureState = $state<SaveState>('idle');

	let toastTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
	function flashSaved(setter: (s: SaveState) => void, key: string) {
		setter('saved');
		if (toastTimers[key]) clearTimeout(toastTimers[key]);
		toastTimers[key] = setTimeout(() => setter('idle'), 1800);
	}

	async function saveSettings(patch: { displayName?: string; signature?: string }, setter: (s: SaveState) => void, key: string) {
		setter('saving');
		try {
			const res = await fetch('/api/preferences/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) { setter('error'); return; }
			await invalidateAll();
			flashSaved(setter, key);
		} catch {
			setter('error');
		}
	}
</script>

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
				onblur={() => saveSettings({ displayName }, (s) => displayNameState = s, 'displayName')}
				onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
				placeholder="Your name"
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors w-[220px]"
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Signature"
		description="Appended automatically to new emails."
		state={signatureState}
	>
		{#snippet control()}
			<textarea
				bind:value={signature}
				onblur={() => saveSettings({ signature }, (s) => signatureState = s, 'signature')}
				rows={4}
				placeholder={"e.g. Best regards,\nOdai Ameera"}
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors resize-none w-[320px] font-sans"
			></textarea>
		{/snippet}
	</SettingRow>
</section>
