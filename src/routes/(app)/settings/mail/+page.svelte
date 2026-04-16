<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import Select from '$lib/components/settings/Select.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let conversationView = $state(data.conversationView);
	let markReadDelay = $state(String(data.markReadDelay));
	let autoLoadImages = $state(data.autoLoadImages);
	let defaultSort = $state(data.defaultSort);
	let keyboardShortcuts = $state(data.keyboardShortcuts);

	const states = $state<Record<string, SaveState>>({});
	function flash(key: string, ok: boolean) {
		states[key] = ok ? 'saved' : 'error';
		if (ok) setTimeout(() => { if (states[key] === 'saved') states[key] = 'idle'; }, 1800);
	}

	async function save(patch: Record<string, unknown>, key: string) {
		states[key] = 'saving';
		try {
			const res = await fetch('/api/preferences/mail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			flash(key, res.ok);
			if (res.ok) await invalidateAll();
		} catch {
			flash(key, false);
		}
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Mail', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Mail</h1>
	<p class="text-sm text-text-tertiary mt-1">How messages are displayed and treated.</p>
</header>

<section>
	<SettingRow
		title="Conversation view"
		description="Group related messages by thread. Switching off shows each message as its own row."
		state={states.conversationView ?? 'idle'}
	>
		{#snippet control()}
			<Toggle
				checked={conversationView}
				onChange={(v) => { conversationView = v; save({ conversationView: v }, 'conversationView'); }}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Default sort"
		description="Initial order for the inbox and folder views."
		state={states.defaultSort ?? 'idle'}
	>
		{#snippet control()}
			<Select
				value={defaultSort}
				ariaLabel="Default sort"
				onchange={(v) => { defaultSort = v; save({ defaultSort: v }, 'defaultSort'); }}
				options={[
					{ value: 'date_desc', label: 'Newest first' },
					{ value: 'date_asc', label: 'Oldest first' },
					{ value: 'subject', label: 'Subject (A–Z)' },
					{ value: 'from', label: 'Sender (A–Z)' }
				]}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Mark as read after"
		description="Time (ms) to wait before marking an open email as read. 0 = instantly."
		state={states.markReadDelay ?? 'idle'}
	>
		{#snippet control()}
			<input
				type="number"
				bind:value={markReadDelay}
				min={0}
				max={10000}
				step={100}
				onblur={() => save({ markReadDelay: parseInt(markReadDelay) || 0 }, 'markReadDelay')}
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent w-[110px]"
				aria-label="Mark as read delay (ms)"
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Auto-load remote images"
		description="Remote images can track whether you opened the message. Choose your comfort level."
		state={states.autoLoadImages ?? 'idle'}
	>
		{#snippet control()}
			<Select
				value={autoLoadImages}
				ariaLabel="Auto-load remote images"
				onchange={(v) => { autoLoadImages = v; save({ autoLoadImages: v }, 'autoLoadImages'); }}
				options={[
					{ value: 'never', label: 'Never' },
					{ value: 'contacts_only', label: 'Contacts only' },
					{ value: 'always', label: 'Always' }
				]}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Keyboard shortcuts"
		description="Enable single-key shortcuts (j/k to navigate, e to archive, etc.)."
		state={states.keyboardShortcuts ?? 'idle'}
	>
		{#snippet control()}
			<Toggle
				checked={keyboardShortcuts}
				onChange={(v) => { keyboardShortcuts = v; save({ keyboardShortcuts: v }, 'keyboardShortcuts'); }}
			/>
		{/snippet}
	</SettingRow>
</section>
