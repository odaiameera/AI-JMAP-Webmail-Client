<script lang="ts">
	import {
		addMonths,
		dayKey,
		monthGridDays,
		monthName,
		sameDay,
		weekdayLabels,
		type WeekStart
	} from '$lib/calendar/dates';

	let {
		selected,
		weekStart,
		onSelect
	}: {
		selected: Date;
		weekStart: WeekStart;
		onSelect: (date: Date) => void;
	} = $props();

	// The month being browsed — follows `selected` until the user pages.
	let viewYear = $state(selected.getFullYear());
	let viewMonth = $state(selected.getMonth());
	let lastSelectedKey = dayKey(selected);

	$effect(() => {
		const key = dayKey(selected);
		if (key !== lastSelectedKey) {
			lastSelectedKey = key;
			viewYear = selected.getFullYear();
			viewMonth = selected.getMonth();
		}
	});

	const days = $derived(monthGridDays(viewYear, viewMonth, weekStart));
	const labels = $derived(weekdayLabels(weekStart).map((l) => l[0]));
	const today = new Date();

	function page(n: number) {
		const next = addMonths(new Date(viewYear, viewMonth, 1), n);
		viewYear = next.getFullYear();
		viewMonth = next.getMonth();
	}
</script>

<div class="select-none">
	<div class="flex items-center justify-between mb-2 px-1">
		<span class="text-sm font-semibold text-text">{monthName(viewMonth)} {viewYear}</span>
		<div class="flex items-center gap-0.5">
			<button
				type="button"
				class="w-6 h-6 rounded-md flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
				onclick={() => page(-1)}
				aria-label="Previous month"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
			</button>
			<button
				type="button"
				class="w-6 h-6 rounded-md flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
				onclick={() => page(1)}
				aria-label="Next month"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
			</button>
		</div>
	</div>

	<div class="grid grid-cols-7 mb-1">
		{#each labels as label, i (i)}
			<div class="text-center text-3xs font-medium text-text-tertiary">{label}</div>
		{/each}
	</div>

	<div class="grid grid-cols-7 gap-y-0.5">
		{#each days as day (dayKey(day))}
			{@const isToday = sameDay(day, today)}
			{@const isSelected = sameDay(day, selected)}
			{@const outside = day.getMonth() !== viewMonth}
			<button
				type="button"
				class="w-6 h-6 mx-auto rounded-full text-2xs flex items-center justify-center transition-colors cursor-pointer
					{isSelected
						? 'bg-accent text-white font-semibold'
						: isToday
							? 'text-accent font-semibold hover:bg-accent/10'
							: outside
								? 'text-text-tertiary/60 hover:bg-surface-hover'
								: 'text-text-secondary hover:bg-surface-hover'}"
				onclick={() => onSelect(day)}
			>
				{day.getDate()}
			</button>
		{/each}
	</div>
</div>
