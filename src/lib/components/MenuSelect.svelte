<script lang="ts" generics="T extends string | number | null">
	import { tick, type Snippet } from 'svelte';

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
		align = 'left',
		placement = 'down'
	}: {
		value: T;
		options: Option[];
		onChange: (value: T) => void;
		ariaLabel: string;
		icon?: Snippet;
		triggerClass?: string;
		align?: 'left' | 'right';
		/** Preferred side; the menu flips when that side lacks room. */
		placement?: 'up' | 'down';
	} = $props();

	const uid = $props.id();
	let open = $state(false);
	let active = $state(0);
	let rootEl = $state<HTMLDivElement | undefined>();
	let triggerEl = $state<HTMLButtonElement | undefined>();
	let listEl = $state<HTMLUListElement | undefined>();
	let listStyle = $state('visibility: hidden');

	const current = $derived(options.find((o) => o.value === value) ?? options[0]);

	// The open list lives on <body>, so a scrolling dialog body can't clip it
	// and a transformed ancestor (the full-screen composer) can't offset it.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	// Place the list against the trigger once it has rendered and its height
	// is known, on the preferred side unless only the other side has room.
	$effect(() => {
		if (!open || !listEl || !triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		const h = listEl.offsetHeight;
		const below = window.innerHeight - r.bottom - 8;
		const above = r.top - 8;
		const up = placement === 'up' ? above >= h || above > below : below < h && above > below;
		const vertical = up ? `bottom: ${window.innerHeight - r.top + 4}px` : `top: ${r.bottom + 4}px`;
		const horizontal = align === 'right' ? `right: ${window.innerWidth - r.right}px` : `left: ${r.left}px`;
		listStyle = `${vertical}; ${horizontal}; min-width: ${r.width}px; max-height: ${Math.min(320, Math.max(up ? above : below, 120))}px`;
		// Hidden elements can't take focus, so wait for the style to land.
		void tick().then(() => listEl?.focus({ preventScroll: true }));
	});

	// A fixed list would drift from its trigger on scroll or resize; close it.
	$effect(() => {
		if (!open) return;
		const onScroll = (e: Event) => {
			if (!listEl?.contains(e.target as Node)) open = false;
		};
		const onResize = () => (open = false);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onResize);
		};
	});

	function openMenu() {
		active = Math.max(0, options.findIndex((o) => o.value === value));
		listStyle = 'visibility: hidden';
		open = true;
	}

	// Focus goes back to the trigger: the list is outside the dialog, so
	// leaving focus on <body> would cut keyboard users off from it.
	function close() {
		open = false;
		triggerEl?.focus();
	}

	function choose(option: Option) {
		close();
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
			// Escape closes this menu only, not the dialog around it.
			e.preventDefault();
			e.stopPropagation();
			close();
		}
	}

	function onWindowPointerDown(e: PointerEvent) {
		const target = e.target as Node;
		if (open && !rootEl?.contains(target) && !listEl?.contains(target)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div bind:this={rootEl} class="relative min-w-0">
	<button
		bind:this={triggerEl}
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
			use:portal
			style={listStyle}
			role="listbox"
			tabindex="-1"
			aria-label={ariaLabel}
			aria-activedescendant="{uid}-opt-{active}"
			onkeydown={onListKeydown}
			class="fixed z-[100] w-max max-w-[min(28rem,90vw)] overflow-y-auto py-1 rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.35)] outline-none"
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
