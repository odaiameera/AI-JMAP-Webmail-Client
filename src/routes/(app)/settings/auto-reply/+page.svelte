<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let enabled = $state(data.autoReplyEnabled);
	let subject = $state(data.autoReplySubject);
	let body = $state(data.autoReplyBody);

	let deployState = $state<SaveState>('idle');
	let deployError = $state('');

	/**
	 * Save the auto-reply cookies, then redeploy the Sieve script so the
	 * vacation block is actually live. The deploy endpoint reads the
	 * auto-reply cookies we just set.
	 */
	async function save(patch: { enabled?: boolean; subject?: string; body?: string }) {
		deployState = 'saving';
		deployError = '';
		try {
			const prefRes = await fetch('/api/preferences/auto-reply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!prefRes.ok) {
				deployState = 'error';
				deployError = 'Failed to save settings';
				return;
			}

			const deployRes = await fetch('/api/rules/deploy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: data.rules })
			});
			const deployData = await deployRes.json().catch(() => ({}));
			if (!deployRes.ok || deployData?.error) {
				deployState = 'error';
				deployError = deployData?.error ?? 'Failed to deploy Sieve script';
				return;
			}

			await invalidateAll();
			deployState = 'saved';
			setTimeout(() => { if (deployState === 'saved') deployState = 'idle'; }, 1800);
		} catch (err) {
			deployState = 'error';
			deployError = err instanceof Error ? err.message : 'Save failed';
		}
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Auto-reply', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Auto-reply</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Send an automatic response to incoming mail while you're away. The response is sent
		server-side via Sieve, so it runs even if Ameera isn't open.
	</p>
</header>

{#if deployError}
	<div class="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-4">
		{deployError}
	</div>
{/if}

<section>
	<SettingRow title="Enable auto-reply" description="Turn the responder on or off." state={deployState}>
		{#snippet control()}
			<Toggle
				checked={enabled}
				onChange={(v) => { enabled = v; save({ enabled: v }); }}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Subject"
		description="Used in the outgoing auto-reply's Subject header."
	>
		{#snippet control()}
			<input
				bind:value={subject}
				onblur={() => save({ subject })}
				placeholder="Out of office"
				disabled={!enabled}
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent w-[280px] disabled:opacity-50"
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Message"
		description="Body of the auto-reply. Kept plain-text to maximise deliverability."
	>
		{#snippet control()}
			<textarea
				bind:value={body}
				onblur={() => save({ body })}
				rows={5}
				placeholder="I'm out of the office until next week…"
				disabled={!enabled}
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent w-[360px] resize-none disabled:opacity-50 font-sans"
			></textarea>
		{/snippet}
	</SettingRow>
</section>
