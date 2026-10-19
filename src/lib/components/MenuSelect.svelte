<script lang="ts" generics="T extends string | number | null">
	import type { Snippet } from 'svelte';

	/**
	 * A themed pick-one menu: a button showing the current choice and a
	 * popover list. Replaces native <select>s where the open list matters,
	 * because the OS draws that list itself and ignores the app's theme.
	 */
	type Option = { value: T; label: string; detail?: string };

	let {
		value,
		options,
		onChange,
		ariaLabel,
		icon,
		triggerClass = '',
		align = 'left'
	}: {
		value: T;
		options: Option[];
		onChange: (value: T) => void;
		ariaLabel: string;
		icon?: Snippet;
		triggerClass?: string;
		align?: 'left' | 'right';
	} = $props();

	const uid = $props.id();
	let open = $state(false);
	let active = $state(0);
	let rootEl = $state<HTMLDivElement | undefined>();
	let listEl = $state<HTMLUListElement | undefined>();

	const current = $derived(options.find((o) => o.value === value) ?? options[0]);

	function openMenu() {
		active = Math.max(0, options.findIndex((o) => o.value === value));
		open = true;
		queueMicrotask(() => listEl?.focus());
	}

	function choose(option: Option) {
		open = false;
		if (option.value !== value) onChange(option.value);
	}

	function onListKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % options.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + options.length) % options.length;
		} else if (e.key === 'Home') {
			e.preventDefault();
			active = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			active = options.length - 1;
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			choose(options[active]);
		} else if (e.key === 'Escape' || e.key === 'Tab') {
			// Escape closes this menu only, not the composer around it.
			e.stopPropagation();
			open = false;
		}
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (open && rootEl && !rootEl.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div bind:this={rootEl} class="relative min-w-0">
	<button
		type="button"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		onclick={() => (open ? (open = false) : openMenu())}
		class="flex items-center gap-1.5 min-w-0 max-w-full h-7 px-2 rounded-md text-sm text-text hover:bg-surface-hover transition-colors cursor-pointer {open ? 'bg-surface-hover' : ''} {triggerClass}"
	>
		{#if icon}{@render icon()}{/if}
		<span class="truncate">{current?.label}</span>
		{#if current?.detail}<span class="truncate text-text-tertiary">{current.detail}</span>{/if}
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-text-tertiary" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
	</button>

	{#if open}
		<ul
			bind:this={listEl}
			role="listbox"
			tabindex="-1"
			aria-label={ariaLabel}
			aria-activedescendant="{uid}-opt-{active}"
			onkeydown={onListKeydown}
			class="absolute top-full mt-1 z-50 min-w-full w-max max-w-[min(28rem,90vw)] max-h-72 overflow-y-auto py-1 rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.35)] outline-none {align === 'right' ? 'right-0' : 'left-0'}"
		>
			{#each options as option, i (option.value)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{uid}-opt-{i}"
					role="option"
					aria-selected={option.value === value}
					onclick={() => choose(option)}
					onpointermove={() => (active = i)}
					class="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer {i === active ? 'bg-surface-hover' : ''}"
				>
					<span class="w-3.5 shrink-0 text-accent-fg" aria-hidden="true">
						{#if option.value === value}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						{/if}
					</span>
					<span class="truncate text-text">{option.label}</span>
					{#if option.detail}<span class="truncate text-text-tertiary">{option.detail}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
