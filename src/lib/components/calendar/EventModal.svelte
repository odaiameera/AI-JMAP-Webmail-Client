<script lang="ts">
	import type {
		CalendarInfo,
		EventInstance,
		EventWritePayload,
		RecurrenceRule,
		RRuleWeekday
	} from '$lib/calendar/types';
	import {
		addDays,
		dayKey,
		fromDayKey,
		instanceDate,
		localTimeZone
	} from '$lib/calendar/dates';

	let {
		open,
		calendars,
		editing = null,
		prefill = null,
		prefillExtras = null,
		onSubmit,
		onClose
	}: {
		open: boolean;
		calendars: CalendarInfo[];
		/** Instance being edited, or null when creating. */
		editing?: EventInstance | null;
		/** Creation prefill from a grid click/drag. */
		prefill?: { start: Date; end: Date; allDay: boolean } | null;
		/** Extra creation prefill (AI extraction, invitations): text fields. */
		prefillExtras?: { title?: string; location?: string; description?: string } | null;
		onSubmit: (payload: EventWritePayload) => Promise<{ ok: boolean; error?: string }>;
		onClose: () => void;
	} = $props();

	const WEEKDAYS: { code: RRuleWeekday; label: string }[] = [
		{ code: 'SU', label: 'S' },
		{ code: 'MO', label: 'M' },
		{ code: 'TU', label: 'T' },
		{ code: 'WE', label: 'W' },
		{ code: 'TH', label: 'T' },
		{ code: 'FR', label: 'F' },
		{ code: 'SA', label: 'S' }
	];
	const DAY_CODES: RRuleWeekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
	const ALARM_OPTIONS = [
		{ value: 0, label: 'At time of event' },
		{ value: 5, label: '5 minutes before' },
		{ value: 10, label: '10 minutes before' },
		{ value: 15, label: '15 minutes before' },
		{ value: 30, label: '30 minutes before' },
		{ value: 60, label: '1 hour before' },
		{ value: 120, label: '2 hours before' },
		{ value: 1440, label: '1 day before' },
		{ value: 2880, label: '2 days before' },
		{ value: 10080, label: '1 week before' }
	];

	let title = $state('');
	let allDay = $state(false);
	let startDate = $state('');
	let startTime = $state('09:00');
	let endDate = $state('');
	let endTime = $state('10:00');
	let calendarId = $state('');
	let location = $state('');
	let description = $state('');
	let alarms = $state<number[]>([10]);
	let attendees = $state<string[]>([]);
	let attendeeInput = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let titleEl = $state<HTMLInputElement | null>(null);
	let previousOpen = false;

	// Recurrence: preset key drives the rule; 'custom' opens the builder.
	let recurrence = $state('none');
	let customFreq = $state<RecurrenceRule['freq']>('WEEKLY');
	let customInterval = $state(1);
	let customByDay = $state<RRuleWeekday[]>([]);
	let customEnds = $state<'never' | 'until' | 'count'>('never');
	let customUntil = $state('');
	let customCount = $state(10);

	function minutesToTime(d: Date): string {
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	$effect(() => {
		if (open && !previousOpen) {
			error = null;
			saving = false;
			attendeeInput = '';
			if (editing) {
				const s = instanceDate(editing.start, editing.allDay);
				const e = instanceDate(editing.end, editing.allDay);
				title = editing.title;
				allDay = editing.allDay;
				startDate = dayKey(s);
				startTime = editing.allDay ? '09:00' : minutesToTime(s);
				endDate = editing.allDay ? dayKey(addDays(e, -1)) : dayKey(e);
				endTime = editing.allDay ? '10:00' : minutesToTime(e);
				calendarId = editing.calendarId;
				location = editing.location;
				description = editing.description;
				alarms = [...editing.alarms];
				attendees = editing.attendees.map((a) => a.email);
				hydrateRecurrence(editing.rrule);
			} else {
				const base = prefill ?? defaultSlot();
				title = prefillExtras?.title ?? '';
				allDay = base.allDay;
				startDate = dayKey(base.start);
				startTime = minutesToTime(base.start);
				endDate = base.allDay ? dayKey(addDays(base.end, -1)) : dayKey(base.end);
				endTime = minutesToTime(base.end);
				calendarId = calendars.find((c) => c.isDefault)?.id ?? calendars[0]?.id ?? '';
				location = prefillExtras?.location ?? '';
				description = prefillExtras?.description ?? '';
				alarms = [10];
				attendees = [];
				recurrence = 'none';
				resetCustom();
			}
			setTimeout(() => titleEl?.focus(), 0);
		}
		previousOpen = open;
	});

	function defaultSlot(): { start: Date; end: Date; allDay: boolean } {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
		return { start, end: new Date(start.getTime() + 3600000), allDay: false };
	}

	function resetCustom() {
		customFreq = 'WEEKLY';
		customInterval = 1;
		customByDay = [];
		customEnds = 'never';
		customUntil = '';
		customCount = 10;
	}

	function hydrateRecurrence(rule: RecurrenceRule | null) {
		resetCustom();
		if (!rule) {
			recurrence = 'none';
			return;
		}
		// Try to map onto a preset; anything richer becomes 'custom'.
		const plain = rule.interval === 1 && !rule.until && !rule.count;
		if (plain && rule.freq === 'DAILY') recurrence = 'daily';
		else if (plain && rule.freq === 'WEEKLY' && (rule.byDay?.length ?? 0) <= 1) recurrence = 'weekly';
		else if (
			plain &&
			rule.freq === 'WEEKLY' &&
			rule.byDay?.length === 5 &&
			['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => rule.byDay?.includes(d as RRuleWeekday))
		)
			recurrence = 'weekdays';
		else if (plain && rule.freq === 'MONTHLY' && !rule.byDayOrdinal) recurrence = 'monthly';
		else if (plain && rule.freq === 'YEARLY') recurrence = 'yearly';
		else {
			recurrence = 'custom';
			customFreq = rule.freq;
			customInterval = rule.interval || 1;
			customByDay = rule.byDay ? [...rule.byDay] : [];
			if (rule.until) {
				customEnds = 'until';
				customUntil = rule.until;
			} else if (rule.count) {
				customEnds = 'count';
				customCount = rule.count;
			}
		}
	}

	const startWeekdayCode = $derived(DAY_CODES[(fromDayKey(startDate || dayKey(new Date()))).getDay()]);
	const startWeekdayName = $derived(
		fromDayKey(startDate || dayKey(new Date())).toLocaleDateString(undefined, { weekday: 'long' })
	);
	const startDayOfMonth = $derived(fromDayKey(startDate || dayKey(new Date())).getDate());

	function buildRule(): RecurrenceRule | null {
		switch (recurrence) {
			case 'none':
				return null;
			case 'daily':
				return { freq: 'DAILY', interval: 1 };
			case 'weekly':
				return { freq: 'WEEKLY', interval: 1, byDay: [startWeekdayCode] };
			case 'weekdays':
				return { freq: 'WEEKLY', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] };
			case 'monthly':
				return { freq: 'MONTHLY', interval: 1, byMonthDay: startDayOfMonth };
			case 'yearly':
				return { freq: 'YEARLY', interval: 1 };
			case 'custom': {
				const rule: RecurrenceRule = {
					freq: customFreq,
					interval: Math.max(1, Math.min(99, Math.round(customInterval) || 1))
				};
				if (customFreq === 'WEEKLY') {
					rule.byDay = customByDay.length > 0 ? [...customByDay] : [startWeekdayCode];
				}
				if (customFreq === 'MONTHLY') rule.byMonthDay = startDayOfMonth;
				if (customEnds === 'until' && customUntil) rule.until = customUntil;
				if (customEnds === 'count') rule.count = Math.max(1, Math.min(999, Math.round(customCount) || 1));
				return rule;
			}
			default:
				return null;
		}
	}

	// Keep the event duration stable when the start moves (Google behavior).
	let lastStart = '';
	$effect(() => {
		const cur = `${startDate}T${startTime}`;
		if (!open) {
			lastStart = '';
			return;
		}
		if (lastStart && lastStart !== cur && startDate && endDate) {
			const prev = new Date(lastStart);
			const next = new Date(cur);
			if (!isNaN(prev.getTime()) && !isNaN(next.getTime())) {
				const end = new Date(`${endDate}T${endTime}`);
				if (!isNaN(end.getTime())) {
					const shifted = new Date(end.getTime() + (next.getTime() - prev.getTime()));
					endDate = dayKey(shifted);
					endTime = minutesToTime(shifted);
				}
			}
		}
		lastStart = cur;
	});

	function addAttendee() {
		const email = attendeeInput.trim().replace(/,$/, '');
		if (!email) return;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			error = 'Enter a valid guest email address';
			return;
		}
		if (!attendees.includes(email.toLowerCase())) {
			attendees = [...attendees, email.toLowerCase()];
		}
		attendeeInput = '';
		error = null;
	}

	async function handleSave() {
		if (saving) return;
		error = null;
		if (!startDate || !endDate) {
			error = 'Start and end dates are required';
			return;
		}
		if (!calendarId) {
			error = 'Pick a calendar';
			return;
		}

		let payload: EventWritePayload;
		if (allDay) {
			const endExclusive = dayKey(addDays(fromDayKey(endDate), 1));
			if (endDate < startDate) {
				error = 'End date is before the start date';
				return;
			}
			payload = {
				calendarId,
				title: title.trim(),
				allDay: true,
				start: startDate,
				end: endExclusive,
				timeZone: localTimeZone()
			};
		} else {
			const start = `${startDate}T${startTime}`;
			const end = `${endDate}T${endTime}`;
			if (end <= start) {
				error = 'End must be after the start';
				return;
			}
			payload = {
				calendarId,
				title: title.trim(),
				allDay: false,
				start,
				end,
				timeZone: localTimeZone()
			};
		}
		payload.description = description.trim();
		payload.location = location.trim();
		payload.rrule = buildRule();
		payload.alarms = [...alarms].sort((a, b) => a - b);
		payload.attendees = attendees.map((email) => ({ email }));

		saving = true;
		const result = await onSubmit(payload);
		saving = false;
		if (result.ok) {
			onClose();
		} else if (result.error) {
			error = result.error;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (!saving) onClose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="event-modal-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget && !saving) onClose();
		}}
		onkeydown={handleKeydown}
	>
		<div
			class="bg-surface border border-border rounded-xl w-full max-w-lg mx-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] flex flex-col max-h-[90vh]"
			role="document"
		>
			<div class="flex items-center justify-between px-6 pt-5 pb-3">
				<h2 id="event-modal-title" class="text-lg font-semibold text-text">
					{editing ? 'Edit event' : 'New event'}
				</h2>
				<button
					type="button"
					class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
					onclick={() => !saving && onClose()}
					aria-label="Close"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>

			<div class="px-6 pb-2 overflow-y-auto space-y-4">
				<input
					type="text"
					bind:value={title}
					bind:this={titleEl}
					maxlength={500}
					placeholder="Add title"
					class="w-full bg-transparent border-0 border-b-2 border-border focus:border-accent text-xl text-text placeholder-text-tertiary outline-none pb-1.5 transition-colors"
				/>

				<!-- Date / time row -->
				<div class="space-y-2.5">
					<div class="flex items-center gap-2 flex-wrap">
						<input
							type="date"
							bind:value={startDate}
							class="cal-input"
							aria-label="Start date"
						/>
						{#if !allDay}
							<input type="time" bind:value={startTime} step="900" class="cal-input" aria-label="Start time" />
						{/if}
						<span class="text-text-tertiary text-sm">–</span>
						{#if !allDay}
							<input type="time" bind:value={endTime} step="900" class="cal-input" aria-label="End time" />
						{/if}
						<input type="date" bind:value={endDate} class="cal-input" aria-label="End date" />
					</div>
					<label class="inline-flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
						<input type="checkbox" bind:checked={allDay} class="w-3.5 h-3.5 accent-accent cursor-pointer" />
						All day
					</label>
				</div>

				<!-- Recurrence -->
				<div class="space-y-2">
					<select bind:value={recurrence} class="cal-input cursor-pointer" aria-label="Repeats">
						<option value="none">Does not repeat</option>
						<option value="daily">Daily</option>
						<option value="weekly">Weekly on {startWeekdayName}</option>
						<option value="weekdays">Every weekday (Mon–Fri)</option>
						<option value="monthly">Monthly on day {startDayOfMonth}</option>
						<option value="yearly">Annually</option>
						<option value="custom">Custom…</option>
					</select>

					{#if recurrence === 'custom'}
						<div class="rounded-lg border border-border bg-surface-hover/40 p-3 space-y-3">
							<div class="flex items-center gap-2 text-sm text-text">
								<span>Repeat every</span>
								<input
									type="number"
									min="1"
									max="99"
									bind:value={customInterval}
									class="cal-input w-16 text-center"
									aria-label="Interval"
								/>
								<select bind:value={customFreq} class="cal-input cursor-pointer" aria-label="Frequency">
									<option value="DAILY">day{customInterval > 1 ? 's' : ''}</option>
									<option value="WEEKLY">week{customInterval > 1 ? 's' : ''}</option>
									<option value="MONTHLY">month{customInterval > 1 ? 's' : ''}</option>
									<option value="YEARLY">year{customInterval > 1 ? 's' : ''}</option>
								</select>
							</div>

							{#if customFreq === 'WEEKLY'}
								<div class="flex items-center gap-1.5">
									{#each WEEKDAYS as wd (wd.code)}
										<button
											type="button"
											class="w-7 h-7 rounded-full text-xs font-medium transition-colors cursor-pointer
												{customByDay.includes(wd.code)
													? 'bg-accent text-white'
													: 'bg-surface-hover text-text-secondary hover:text-text'}"
											aria-pressed={customByDay.includes(wd.code)}
											onclick={() => {
												customByDay = customByDay.includes(wd.code)
													? customByDay.filter((c) => c !== wd.code)
													: [...customByDay, wd.code];
											}}
										>
											{wd.label}
										</button>
									{/each}
								</div>
							{/if}

							<div class="flex items-center gap-2 text-sm text-text flex-wrap">
								<span>Ends</span>
								<select bind:value={customEnds} class="cal-input cursor-pointer" aria-label="Ends">
									<option value="never">never</option>
									<option value="until">on date</option>
									<option value="count">after</option>
								</select>
								{#if customEnds === 'until'}
									<input type="date" bind:value={customUntil} class="cal-input" aria-label="End by date" />
								{:else if customEnds === 'count'}
									<input
										type="number"
										min="1"
										max="999"
										bind:value={customCount}
										class="cal-input w-16 text-center"
										aria-label="Occurrence count"
									/>
									<span>occurrence{customCount > 1 ? 's' : ''}</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Calendar + reminders -->
				<div class="flex items-center gap-2 flex-wrap">
					<select bind:value={calendarId} class="cal-input cursor-pointer" aria-label="Calendar">
						{#each calendars as cal (cal.id)}
							<option value={cal.id}>{cal.name}</option>
						{/each}
					</select>
					<span
						class="w-3 h-3 rounded-full shrink-0"
						style="background: {calendars.find((c) => c.id === calendarId)?.color ?? '#6366F1'};"
					></span>
				</div>

				<div class="space-y-1.5">
					{#each alarms as alarm, i (i)}
						<div class="flex items-center gap-2">
							<svg class="text-text-tertiary shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
							<select
								value={alarm}
								onchange={(e) => {
									const next = [...alarms];
									next[i] = Number((e.currentTarget as HTMLSelectElement).value);
									alarms = next;
								}}
								class="cal-input cursor-pointer"
								aria-label="Reminder"
							>
								{#each ALARM_OPTIONS as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<button
								type="button"
								class="fc-btn"
								aria-label="Remove reminder"
								onclick={() => (alarms = alarms.filter((_, idx) => idx !== i))}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
							</button>
						</div>
					{/each}
					{#if alarms.length < 5}
						<button
							type="button"
							class="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer"
							onclick={() => (alarms = [...alarms, 30])}
						>
							+ Add reminder
						</button>
					{/if}
				</div>

				<!-- Location / description -->
				<input
					type="text"
					bind:value={location}
					maxlength={500}
					placeholder="Add location"
					class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
				/>
				<textarea
					bind:value={description}
					maxlength={10000}
					placeholder="Add description"
					rows={3}
					class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors resize-y"
				></textarea>

				<!-- Guests -->
				<div>
					<div class="flex flex-wrap gap-1.5 mb-1.5">
						{#each attendees as a (a)}
							<span class="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-surface-hover border border-border text-xs text-text">
								{a}
								<button
									type="button"
									class="w-4 h-4 rounded-full flex items-center justify-center text-text-tertiary hover:text-text cursor-pointer"
									aria-label="Remove {a}"
									onclick={() => (attendees = attendees.filter((x) => x !== a))}
								>
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
								</button>
							</span>
						{/each}
					</div>
					<input
						type="text"
						bind:value={attendeeInput}
						placeholder="Add guests (email, press Enter)"
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ',') {
								e.preventDefault();
								addAttendee();
							}
						}}
						onblur={addAttendee}
					/>
					{#if attendees.length > 0}
						<p class="text-xs text-text-tertiary mt-1">Guests receive an email invitation from the mail server.</p>
					{/if}
				</div>

				{#if error}
					<div class="text-sm text-danger" aria-live="polite">{error}</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2 px-6 py-4 border-t border-border">
				<button
					type="button"
					class="px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer disabled:opacity-60"
					onclick={() => onClose()}
					disabled={saving}
				>
					Cancel
				</button>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
					onclick={handleSave}
					disabled={saving}
				>
					{#if saving}
						<span class="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
					{/if}
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.cal-input {
		height: 32px;
		font-size: 13px;
		padding: 0 8px;
		background: var(--color-surface-hover);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		color: var(--color-text);
	}
	.cal-input:focus {
		outline: none;
		border-color: var(--color-accent);
	}
	input[type='date'].cal-input::-webkit-calendar-picker-indicator,
	input[type='time'].cal-input::-webkit-calendar-picker-indicator {
		filter: invert(0.6);
		cursor: pointer;
	}
</style>
