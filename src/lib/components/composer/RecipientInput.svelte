<script lang="ts">
	import { getRecentRecipients, isValidEmail } from '$lib/utils/recent-recipients';

	let {
		value = $bindable(''),
		label,
		placeholder = '',
		autofocus = false
	}: {
		value?: string;
		label: string;
		placeholder?: string;
		autofocus?: boolean;
	} = $props();

	let draft = $state('');
	let inputEl = $state<HTMLInputElement | undefined>();
	let highlight = $state(-1);
	let focused = $state(false);

	// Committed chips are derived from the comma-joined `value` so the store
	// stays the single source of truth (endpoints still receive a plain string).
	const chips = $derived(
		value
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);

	function setChips(next: string[]) {
		// De-dupe case-insensitively, preserve order.
		const seen = new Set<string>();
		const out: string[] = [];
		for (const c of next) {
			const k = c.toLowerCase();
			if (!c || seen.has(k)) continue;
			seen.add(k);
			out.push(c);
		}
		value = out.join(', ');
	}

	function commitDraft() {
		const t = draft.trim().replace(/,$/, '').trim();
		if (!t) {
			draft = '';
			return;
		}
		setChips([...chips, t]);
		draft = '';
		highlight = -1;
	}

	function removeChip(i: number) {
		setChips(chips.filter((_, idx) => idx !== i));
		inputEl?.focus();
	}

	const suggestions = $derived.by(() => {
		const q = draft.trim().toLowerCase();
		if (!q) return [];
		const chosen = new Set(chips.map((c) => c.toLowerCase()));
		return getRecentRecipients()
			.filter((e) => e.toLowerCase().includes(q) && !chosen.has(e.toLowerCase()))
			.slice(0, 6);
	});

	function pickSuggestion(email: string) {
		setChips([...chips, email]);
		draft = '';
		highlight = -1;
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			const dir = e.key === 'ArrowDown' ? 1 : -1;
			highlight = (highlight + dir + suggestions.length) % suggestions.length;
			return;
		}
		if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
			if (e.key === 'Tab' && !draft.trim()) return; // let Tab move focus normally
			if (highlight >= 0 && suggestions[highlight]) {
				e.preventDefault();
				pickSuggestion(suggestions[highlight]);
				return;
			}
			if (draft.trim()) {
				e.preventDefault();
				commitDraft();
			}
			return;
		}
		if (e.key === 'Backspace' && !draft && chips.length > 0) {
			e.preventDefault();
			removeChip(chips.length - 1);
		}
	}

	function handleBlur() {
		// Delay so a suggestion click registers before we tear down the menu.
		setTimeout(() => {
			commitDraft();
			focused = false;
		}, 120);
	}
</script>

<div class="flex items-start px-3 py-1.5 border-b border-border/50">
	<span class="text-xs text-text-tertiary w-12 shrink-0 pt-1">{label}</span>
	<div class="relative flex-1 min-w-0">
		<div class="flex flex-wrap items-center gap-1">
			{#each chips as chip, i (chip + i)}
				{@const valid = isValidEmail(chip)}
				<span
					class="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md text-xs max-w-full
						{valid
						? 'bg-accent/15 text-accent-fg'
						: 'bg-danger/15 text-danger ring-1 ring-danger/30'}"
					title={valid ? chip : `${chip} — not a valid address`}
				>
					<span class="truncate">{chip}</span>
					<button
						type="button"
						onclick={() => removeChip(i)}
						class="shrink-0 p-0.5 rounded-md hover:bg-black/20 cursor-pointer"
						aria-label={`Remove ${chip}`}
					>
						<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
					</button>
				</span>
			{/each}
			<input
				bind:this={inputEl}
				bind:value={draft}
				onkeydown={handleKeydown}
				onfocus={() => (focused = true)}
				onblur={handleBlur}
				type="text"
				placeholder={chips.length === 0 ? placeholder : ''}
				{autofocus}
				class="flex-1 min-w-[8ch] bg-transparent text-sm text-text outline-none placeholder-text-tertiary py-0.5"
			/>
		</div>

		{#if focused && suggestions.length > 0}
			<div class="absolute top-full left-0 mt-1 min-w-[220px] max-w-full bg-surface border border-border rounded-lg shadow-xl z-50 py-1">
				{#each suggestions as s, i}
					<button
						type="button"
						onmousedown={(e) => { e.preventDefault(); pickSuggestion(s); }}
						class="w-full text-left px-3 py-1.5 text-xs cursor-pointer truncate
							{i === highlight ? 'bg-accent/15 text-accent-fg' : 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
					>
						{s}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
