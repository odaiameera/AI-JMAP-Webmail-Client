<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import Select from '$lib/components/settings/Select.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let theme = $state(data.theme);
	let density = $state(data.density);
	let readingPane = $state(data.readingPane === 'on');

	let themeState = $state<SaveState>('idle');
	let densityState = $state<SaveState>('idle');
	let readingPaneState = $state<SaveState>('idle');

	async function save(url: string, body: unknown, setter: (s: SaveState) => void) {
		setter('saving');
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) { setter('error'); return; }
			await invalidateAll();
			setter('saved');
			setTimeout(() => setter('idle'), 1800);
		} catch {
			setter('error');
		}
	}

	async function setTheme(next: string) {
		theme = next;
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('light', next === 'light');
		}
		await save('/api/preferences/theme', { value: next }, (s) => (themeState = s));
	}

	async function setDensity(next: string) {
		density = next;
		await save('/api/preferences/density', { value: next }, (s) => (densityState = s));
	}

	async function toggleReadingPane(next: boolean) {
		readingPane = next;
		await save('/api/preferences/reading-pane', { value: next ? 'on' : 'off' }, (s) => (readingPaneState = s));
	}
</script>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Appearance</h1>
	<p class="text-sm text-text-tertiary mt-1">How Ameera looks and feels.</p>
</header>

<section>
	<SettingRow title="Theme" description="Dark or light interface." state={themeState}>
		{#snippet control()}
			<Select
				value={theme}
				ariaLabel="Theme"
				onchange={setTheme}
				options={[
					{ value: 'dark', label: 'Dark' },
					{ value: 'light', label: 'Light' }
				]}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Density"
		description="Compact shows more messages per screen; comfortable has more breathing room."
		state={densityState}
	>
		{#snippet control()}
			<Select
				value={density}
				ariaLabel="Density"
				onchange={setDensity}
				options={[
					{ value: 'comfortable', label: 'Comfortable' },
					{ value: 'compact', label: 'Compact' }
				]}
			/>
		{/snippet}
	</SettingRow>

	<SettingRow
		title="Reading pane"
		description="Show a preview pane to the right of the email list on wide screens."
		state={readingPaneState}
	>
		{#snippet control()}
			<Toggle checked={readingPane} onchange={toggleReadingPane} label="Reading pane" />
		{/snippet}
	</SettingRow>
</section>
