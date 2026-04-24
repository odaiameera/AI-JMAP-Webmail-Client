<script lang="ts">
	import { parseSearch, type Token } from '$lib/search/parse';
	import SearchHelp from './SearchHelp.svelte';
	import SearchQuickFilters from './SearchQuickFilters.svelte';
	import type { Mailbox } from '$lib/jmap/types';

	let {
		value = $bindable(''),
		onSubmit,
		placeholder = 'Search mail',
		mailboxes = []
	}: {
		value?: string;
		onSubmit: (raw: string) => void;
		placeholder?: string;
		mailboxes?: Mailbox[];
	} = $props();

	let panelOpen = $state(false);

	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let focused = $state(false);
	let helpOpen = $state(false);

	/**
	 * Keywords that should convert to an operator pill when the user types
	 * them followed by a space at a word boundary. Listed lowercase; input
	 * is compared case-insensitively so `From ` works too.
	 */
	const TRIGGER_KEYWORDS = new Set([
		'from', 'to', 'cc', 'subject', 'body',
		'before', 'after', 'in', 'label'
	]);

	const tokens = $derived(parseSearch(value));

	/**
	 * When the autoquote path runs we remember the index of the opening
	 * quote so Tab/Enter can close the matching pair even if the user has
	 * moved the caret around in between.
	 */
	let pendingQuoteAt = $state<number | null>(null);

	function handleSubmit(e: Event) {
		e.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		onSubmit(closePendingQuote(trimmed));
	}

	/**
	 * If the user opened an operator pill (`foo:"…`) but didn't close it,
	 * add the trailing quote before we finalize. Returns the potentially
	 * modified raw string; also clears the pending-quote state.
	 */
	function closePendingQuote(raw: string): string {
		if (pendingQuoteAt == null) return raw;
		const open = pendingQuoteAt;
		pendingQuoteAt = null;
		// If the user already typed the closing quote (or deleted the open
		// one), leave the string alone.
		const tail = raw.slice(open + 1);
		if (tail.includes('"') || raw[open] !== '"') return raw;
		return raw + '"';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!inputEl) return;

		if (e.key === 'Escape') {
			value = '';
			pendingQuoteAt = null;
			inputEl.blur();
			return;
		}

		if (e.key === 'Tab' && pendingQuoteAt != null) {
			const open = pendingQuoteAt;
			const tail = value.slice(open + 1);
			if (!tail.includes('"')) {
				e.preventDefault();
				const inserted = value + '" ';
				value = inserted;
				pendingQuoteAt = null;
				queueMicrotask(() => {
					inputEl?.setSelectionRange(inserted.length, inserted.length);
				});
				return;
			}
			pendingQuoteAt = null;
		}

		if (e.key === ' ') {
			const caret = inputEl.selectionStart;
			if (caret == null || caret !== inputEl.selectionEnd) return;
			// Only trigger when space lands at the very end of the input —
			// avoids surprising the user mid-string.
			if (caret !== value.length) return;
			// Word immediately to the left of the caret.
			const match = value.slice(0, caret).match(/(^|\s)([A-Za-z]+)$/);
			if (!match) return;
			const kw = match[2]!.toLowerCase();
			if (!TRIGGER_KEYWORDS.has(kw)) return;

			e.preventDefault();
			const wordStart = caret - match[2]!.length;
			const before = value.slice(0, wordStart);
			const after = value.slice(caret);
			const quoteAt = before.length + kw.length + 1; // position of the opening quote
			value = `${before}${kw}:"${after}`;
			pendingQuoteAt = quoteAt;
			queueMicrotask(() => {
				inputEl?.setSelectionRange(quoteAt + 1, quoteAt + 1);
			});
			return;
		}

		if (e.key === 'Backspace') {
			const caret = inputEl.selectionStart;
			if (caret == null || caret !== inputEl.selectionEnd) return;

			// If we're inside a pending auto-quote with the caret right
			// after the opening `"`, nuke the whole `kw:"` prefix so one
			// backspace undoes the trigger instead of just the quote.
			if (pendingQuoteAt != null && caret === pendingQuoteAt + 1) {
				const open = pendingQuoteAt;
				// Walk back to find the keyword start (`foo:"`).
				const prefix = value.slice(0, open);
				const km = prefix.match(/([A-Za-z]+):$/);
				if (km) {
					e.preventDefault();
					const start = open - km[1]!.length - 1;
					value = value.slice(0, start) + value.slice(open + 1);
					pendingQuoteAt = null;
					queueMicrotask(() => inputEl?.setSelectionRange(start, start));
					return;
				}
			}

			// Caret sits at the right edge of a recognized pill — eat the
			// whole pill in one keystroke.
			const t = tokens.find(
				(tok) => (tok.kind === 'field' || tok.kind === 'flag') && tok.end === caret
			);
			if (!t) return;
			e.preventDefault();
			const next = value.slice(0, t.start) + value.slice(t.end);
			value = next.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
			queueMicrotask(() => {
				inputEl?.setSelectionRange(t.start, t.start);
			});
		}
	}

	function handleBlur() {
		// Close an unfinalized auto-quote so the rendered pill is complete.
		if (pendingQuoteAt != null) {
			value = closePendingQuote(value);
		}
		setTimeout(() => (focused = false), 150);
	}

	function handleFocus() {
		focused = true;
	}

	function handleFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && (e.currentTarget as HTMLElement).contains(next)) return;
		// Delay so clicks on panel buttons register before we teardown.
		setTimeout(() => (panelOpen = false), 150);
	}

	$effect(() => {
		// Panel only opens once the user actually starts typing; it stays
		// visible while the input has content and we still have focus.
		if (focused && value.length > 0) panelOpen = true;
		else if (value.length === 0) panelOpen = false;
	});

	function pillClass(token: Token): string {
		if (token.kind === 'field') return 'bg-accent/15 text-accent';
		if (token.kind === 'flag') return 'bg-purple-500/15 text-purple-300';
		if (token.kind === 'error') return 'bg-red-500/15 text-red-400';
		return '';
	}

	function pillLabel(token: Token): string {
		if (token.kind === 'field') return `${token.field}: ${token.value}`;
		if (token.kind === 'flag') return `${token.op}: ${token.value}`;
		if (token.kind === 'error') return token.raw;
		return token.raw;
	}
</script>

<form onsubmit={handleSubmit} onfocusout={handleFocusOut} class="relative w-[420px]">
	<div class="relative">
		<!-- Underlay: rendered tokens. Mirrors the input's typography so the
		     pills sit where the text actually is. Hidden when the caret is
		     active so the user sees what they're typing without double-text. -->
		{#if !focused && tokens.length > 0}
			<div
				aria-hidden="true"
				class="absolute inset-y-0 left-0 right-9 flex items-center gap-1 pl-3 pr-1 pointer-events-none overflow-hidden whitespace-nowrap"
			>
				{#each tokens as t (t.start)}
					{#if t.kind === 'text'}
						<span class="text-sm text-text">{t.raw}</span>
					{:else}
						<span
							class="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium leading-none {pillClass(t)}"
							title={t.kind === 'error' ? t.reason : pillLabel(t)}
						>
							{pillLabel(t)}
						</span>
					{/if}
				{/each}
			</div>
		{/if}

		<input
			bind:this={inputEl}
			bind:value
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			type="text"
			{placeholder}
			class="w-full bg-bg/50 border border-border rounded-lg pl-3.5 pr-9 py-1.5 text-sm text-text placeholder-text-tertiary
				focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent transition-colors
				{!focused && tokens.length > 0 ? 'text-transparent caret-text' : ''}"
		/>

		<button
			type="button"
			onmousedown={(e) => { e.preventDefault(); helpOpen = !helpOpen; }}
			class="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
			aria-label="Search help"
			title="Search operators"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
		</button>
	</div>

	{#if helpOpen}
		<SearchHelp onClose={() => (helpOpen = false)} />
	{/if}

	{#if panelOpen && !helpOpen}
		<div class="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg p-2 z-30">
			<SearchQuickFilters {mailboxes} />
		</div>
	{/if}
</form>
