<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Select from '$lib/components/settings/Select.svelte';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let weekStart = $state(String(data.calendarWeekStart));

	const states = $state<Record<string, SaveState>>({});
	function flash(key: string, ok: boolean) {
		states[key] = ok ? 'saved' : 'error';
		if (ok) setTimeout(() => { if (states[key] === 'saved') states[key] = 'idle'; }, 1800);
	}

	async function save(body: unknown, key: string) {
		states[key] = 'saving';
		try {
			const res = await fetch('/api/preferences/calendar', {
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
</script>

<svelte:head><title>{pageTitle({ page: 'Calendar', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Calendar</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Display preferences for the calendar app. Event notifications live under
		<a href="/settings/notifications" class="text-accent-fg hover:text-accent-fg-hover transition-colors">Notifications</a>.
	</p>
</header>

<section>
	<SettingRow
		title="Week starts on"
		description="First day of the week in the month grid, week view and mini calendar."
		state={states.weekStart ?? 'idle'}
	>
		{#snippet control()}
			<Select
				value={weekStart}
				ariaLabel="Week starts on"
				options={[
					{ value: '6', label: 'Saturday' },
					{ value: '0', label: 'Sunday' },
					{ value: '1', label: 'Monday' }
				]}
				onchange={(next) => {
					weekStart = next;
					save({ weekStart: Number(next) }, 'weekStart');
				}}
			/>
		{/snippet}
	</SettingRow>
</section>
