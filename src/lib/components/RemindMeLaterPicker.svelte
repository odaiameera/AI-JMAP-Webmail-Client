<script lang="ts">
	let {
		onPick,
		onClose
	}: {
		onPick: (remindAtIso: string) => void;
		onClose: () => void;
	} = $props();

	interface Preset {
		label: string;
		hint: string;
		when: Date;
	}

	/**
	 * Presets computed in the user's local timezone. "Later today" is
	 * skipped after 16:00 because by then the 18:00 target is too close to
	 * be useful. Saturday is skipped on weekends for the same reason.
	 */
	function buildPresets(): Preset[] {
		const now = new Date();
		const out: Preset[] = [];

		const laterToday = new Date(now);
		laterToday.setHours(18, 0, 0, 0);
		if (now.getHours() < 16) {
			out.push({ label: 'Later today', hint: format(laterToday), when: laterToday });
		}

		const tomorrowMorning = new Date(now);
		tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
		tomorrowMorning.setHours(9, 0, 0, 0);
		out.push({
			label: 'Tomorrow morning',
			hint: format(tomorrowMorning),
			when: tomorrowMorning
		});

		const tomorrowEvening = new Date(tomorrowMorning);
		tomorrowEvening.setHours(18, 0, 0, 0);
		out.push({
			label: 'Tomorrow evening',
			hint: format(tomorrowEvening),
			when: tomorrowEvening
		});

		const dow = now.getDay(); // 0 Sun ... 6 Sat
		if (dow >= 1 && dow <= 4) {
			const weekend = new Date(now);
			const delta = 6 - dow; // days until Saturday
			weekend.setDate(weekend.getDate() + delta);
			weekend.setHours(9, 0, 0, 0);
			out.push({ label: 'This weekend', hint: format(weekend), when: weekend });
		}

		const nextMonday = new Date(now);
		const deltaMon = ((8 - dow) % 7) || 7;
		nextMonday.setDate(nextMonday.getDate() + deltaMon);
		nextMonday.setHours(9, 0, 0, 0);
		out.push({ label: 'Next week', hint: format(nextMonday), when: nextMonday });

		return out;
	}

	function format(d: Date): string {
		return d.toLocaleString(undefined, {
			weekday: 'short',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const presets = $derived(buildPresets());

	let customMode = $state(false);
	let customValue = $state(defaultCustomValue());

	function defaultCustomValue(): string {
		const d = new Date();
		d.setHours(d.getHours() + 2, 0, 0, 0);
		// `datetime-local` wants `YYYY-MM-DDTHH:mm` without seconds or TZ.
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function pickPreset(p: Preset) {
		onPick(p.when.toISOString());
	}

	function pickCustom() {
		const d = new Date(customValue);
		if (isNaN(d.getTime())) return;
		if (d.getTime() <= Date.now()) return;
		onPick(d.toISOString());
	}

	function handleWindowClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-rml-picker]')) onClose();
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div
	data-rml-picker
	class="absolute top-full right-0 mt-1 w-64 bg-surface border border-border rounded-lg shadow-xl z-50 py-1"
>
	<div class="px-3 py-1.5 text-3xs uppercase tracking-wider text-text-tertiary font-semibold">
		Remind me later
	</div>

	{#if !customMode}
		{#each presets as p}
			<button
				type="button"
				onclick={() => pickPreset(p)}
				class="w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-hover cursor-pointer flex items-center justify-between gap-2"
			>
				<span>{p.label}</span>
				<span class="text-text-tertiary">{p.hint}</span>
			</button>
		{/each}
		<div class="border-t border-border my-1"></div>
		<button
			type="button"
			onclick={() => (customMode = true)}
			class="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer"
		>
			Pick a date &amp; time…
		</button>
	{:else}
		<div class="p-3 flex flex-col gap-2">
			<input
				type="datetime-local"
				bind:value={customValue}
				class="bg-surface-hover border border-border rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
			/>
			<div class="flex items-center justify-between">
				<button
					type="button"
					onclick={() => (customMode = false)}
					class="text-2xs text-text-tertiary hover:text-text-secondary cursor-pointer"
				>
					Back
				</button>
				<button
					type="button"
					onclick={pickCustom}
					class="bg-accent hover:bg-accent-hover text-white text-xs font-medium px-3 py-1 rounded cursor-pointer"
				>
					Remind me
				</button>
			</div>
		</div>
	{/if}
</div>
