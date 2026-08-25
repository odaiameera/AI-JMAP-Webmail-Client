<script lang="ts">
	import type { CalendarInfo, EventInstance } from '$lib/calendar/types';
	import { DEFAULT_CALENDAR_COLOR } from '$lib/calendar/types';
	import {
		dayKey,
		formatTime,
		instanceDate,
		sameDay,
		weekdayLabels,
		type WeekStart
	} from '$lib/calendar/dates';
	import {
		layoutWeekSegments,
		spanningEvents,
		timedEventsByDay,
		type WeekSegment
	} from '$lib/calendar/layout';

	let {
		days,
		monthIndex,
		events,
		calendars,
		weekStart,
		onSelectDay,
		onCreateAt,
		onEventClick
	}: {
		/** 42 consecutive local days. */
		days: Date[];
		monthIndex: number;
		events: EventInstance[];
		calendars: CalendarInfo[];
		weekStart: WeekStart;
		onSelectDay: (day: Date) => void;
		onCreateAt: (day: Date) => void;
		onEventClick: (ev: EventInstance, x: number, y: number) => void;
	} = $props();

	const MAX_LANES = 2; // spanning chip rows shown per week
	const MAX_TIMED = 2; // timed rows shown per day under the lanes

	const colorOf = $derived(new Map(calendars.map((c) => [c.id, c.color])));
	const weeks = $derived(Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7)));
	const spans = $derived(spanningEvents(events));
	const timedByDay = $derived(timedEventsByDay(events));
	const labels = $derived(weekdayLabels(weekStart));
	const today = new Date();

	interface WeekLayout {
		visibleSegs: WeekSegment[];
		laneRows: number;
		/** Hidden span count per column (lane overflow). */
		hiddenSpans: number[];
	}

	function layoutWeek(weekDays: Date[]): WeekLayout {
		const segs = layoutWeekSegments(spans, weekDays);
		const laneRows = Math.min(
			MAX_LANES,
			segs.reduce((m, s) => Math.max(m, s.lane + 1), 0)
		);
		const visibleSegs = segs.filter((s) => s.lane < MAX_LANES);
		const hiddenSpans = new Array(7).fill(0);
		for (const s of segs) {
			if (s.lane >= MAX_LANES) {
				for (let c = s.startCol; c < s.startCol + s.span; c++) hiddenSpans[c]++;
			}
		}
		return { visibleSegs, laneRows, hiddenSpans };
	}

	function chipColor(ev: EventInstance): string {
		return colorOf.get(ev.calendarId) ?? DEFAULT_CALENDAR_COLOR;
	}
</script>

<div class="h-full flex flex-col min-h-0 select-none">
	<div class="grid grid-cols-7 border-b border-border">
		{#each labels as label (label)}
			<div class="py-1.5 text-center text-xs font-medium text-text-tertiary">{label}</div>
		{/each}
	</div>

	<div class="flex-1 grid grid-rows-6 min-h-0">
		{#each weeks as weekDays, wi (wi)}
			{@const layout = layoutWeek(weekDays)}
			{@const laneTop = 26}
			{@const chipH = 21}
			<div class="relative grid grid-cols-7 border-b border-border last:border-b-0 min-h-0">
				{#each weekDays as day, di (dayKey(day))}
					{@const key = dayKey(day)}
					{@const timed = timedByDay.get(key) ?? []}
					{@const isToday = sameDay(day, today)}
					{@const outside = day.getMonth() !== monthIndex}
					{@const timedOffset = laneTop + layout.laneRows * chipH}
					{@const visibleTimed = timed.slice(0, MAX_TIMED)}
					{@const hidden = layout.hiddenSpans[di] + Math.max(0, timed.length - MAX_TIMED)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="relative border-r border-border last:border-r-0 overflow-hidden cursor-pointer hover:bg-surface-hover/30 transition-colors {outside ? 'bg-surface/40' : ''}"
						onclick={() => onCreateAt(day)}
					>
						<div class="flex justify-center pt-1">
							<button
								type="button"
								class="w-6 h-6 rounded-full text-xs flex items-center justify-center transition-colors cursor-pointer
									{isToday
										? 'bg-accent text-white font-semibold'
										: outside
											? 'text-text-tertiary/60 hover:bg-surface-hover'
											: 'text-text-secondary hover:bg-surface-hover'}"
								onclick={(e) => {
									e.stopPropagation();
									onSelectDay(day);
								}}
							>
								{day.getDate()}
							</button>
						</div>

						<!-- Timed events, below the spanning lanes -->
						<div class="absolute inset-x-0.5" style="top: {timedOffset}px;">
							{#each visibleTimed as ev (ev.id + (ev.recurrenceId ?? ''))}
								<button
									type="button"
									class="w-full flex items-center gap-1 px-1 h-[21px] rounded text-left hover:bg-surface-hover transition-colors cursor-pointer"
									onclick={(e) => {
										e.stopPropagation();
										onEventClick(ev, e.clientX, e.clientY);
									}}
								>
									<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {chipColor(ev)};"></span>
									<span class="text-2xs text-text-tertiary shrink-0">{formatTime(instanceDate(ev.start, false))}</span>
									<span class="text-2xs text-text truncate">{ev.title || '(untitled)'}</span>
								</button>
							{/each}
							{#if hidden > 0}
								<button
									type="button"
									class="w-full px-1.5 h-[19px] rounded text-left text-2xs text-text-secondary font-medium hover:bg-surface-hover transition-colors cursor-pointer"
									onclick={(e) => {
										e.stopPropagation();
										onSelectDay(day);
									}}
								>
									+{hidden} more
								</button>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Spanning chips overlay (multi-day + all-day) -->
				{#each layout.visibleSegs as seg (seg.event.id + (seg.event.recurrenceId ?? '') + seg.startCol)}
					<button
						type="button"
						class="absolute h-[19px] px-1.5 flex items-center text-2xs text-white font-medium truncate cursor-pointer hover:opacity-90 transition-opacity
							{seg.continuesBefore ? '' : 'rounded-l'} {seg.continuesAfter ? '' : 'rounded-r'}"
						style="
							top: {26 + seg.lane * 21}px;
							left: calc({(seg.startCol / 7) * 100}% + 2px);
							width: calc({(seg.span / 7) * 100}% - 4px);
							background: {chipColor(seg.event)};
						"
						onclick={(e) => {
							e.stopPropagation();
							onEventClick(seg.event, e.clientX, e.clientY);
						}}
					>
						<span class="truncate">{seg.event.title || '(untitled)'}</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>
