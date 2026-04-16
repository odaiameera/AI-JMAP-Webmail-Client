<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Select from '$lib/components/settings/Select.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let font = $state(data.composerFont);
	let fontSize = $state(data.composerFontSize);
	let undoSend = $state(String(data.undoSendSeconds));
	let autoSaveInterval = $state(String(data.autoSaveInterval));

	const states = $state<Record<string, SaveState>>({});
	function flash(key: string, ok: boolean) {
		states[key] = ok ? 'saved' : 'error';
		if (ok) setTimeout(() => { if (states[key] === 'saved') states[key] = 'idle'; }, 1800);
	}

	async function save(url: string, body: unknown, key: string) {
		states[key] = 'saving';
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			flash(key, res.ok);
			if (res.ok) await invalidateAll();
		} catch {
			flash(key, false);
		}
	}

	const fonts = [
		'Calibri', 'Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
		'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS'
	];
</script>

<svelte:head><title>{pageTitle({ page: 'Composer', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Composer</h1>
	<p class="text-sm text-text-tertiary mt-1">Defaults for writing new messages.</p>
</header>

<section>
	<SettingRow title="Default font" description="Base font for outgoing HTML email." state={states.font ?? 'idle'}>
		{#snippet control()}
			<Select
				value={font}
				ariaLabel="Default font"
				onchange={(v) => { font = v; save('/api/preferences/composer', { font: v }, 'font'); }}
				options={fonts.map((f) => ({ value: f, label: f }))}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow title="Default font size" description="Measured in pt. 12pt is typical." state={states.fontSize ?? 'idle'}>
		{#snippet control()}
			<Select
				value={fontSize}
				ariaLabel="Default font size"
				onchange={(v) => { fontSize = v; save('/api/preferences/composer', { fontSize: v }, 'fontSize'); }}
				options={['8', '9', '10', '11', '12', '14', '16', '18', '20', '24'].map((v) => ({ value: v, label: `${v} pt` }))}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Undo send window"
		description="Seconds to delay send so you can undo. 0 disables. (Client-side delay; takes effect in a future update.)"
		state={states.undoSend ?? 'idle'}
	>
		{#snippet control()}
			<Select
				value={undoSend}
				ariaLabel="Undo send window"
				onchange={(v) => { undoSend = v; save('/api/preferences/undo-send', { seconds: parseInt(v) }, 'undoSend'); }}
				options={[
					{ value: '0', label: 'Off' },
					{ value: '5', label: '5 seconds' },
					{ value: '10', label: '10 seconds' },
					{ value: '20', label: '20 seconds' },
					{ value: '30', label: '30 seconds' }
				]}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Auto-save interval"
		description="How often drafts are saved while typing, in seconds."
		state={states.autoSave ?? 'idle'}
	>
		{#snippet control()}
			<input
				type="number"
				bind:value={autoSaveInterval}
				min={5}
				max={120}
				step={1}
				onblur={() => save('/api/preferences/composer', { autoSaveInterval: parseInt(autoSaveInterval) || 10 }, 'autoSave')}
				class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent w-[110px]"
				aria-label="Auto-save interval"
			/>
		{/snippet}
	</SettingRow>
</section>
