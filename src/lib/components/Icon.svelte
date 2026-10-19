<script lang="ts">
	import type { LucideProps } from '@lucide/svelte';
	import { ICONS, type IconName } from '$lib/icons';

	/**
	 * Every icon in the app goes through here: named by job (see $lib/icons),
	 * at one stroke weight and one of four sizes: 12 for the smallest controls
	 * (a chip's ×, a section header's chevron), 14 inline (menus, badges), 16
	 * for buttons, toolbars and the sidebar, 20 for the app rail and empty
	 * panes. Decorative (aria-hidden) unless given an aria-label.
	 */
	let {
		name,
		size = 16,
		class: className = '',
		...rest
	}: {
		name: IconName;
		size?: 12 | 14 | 16 | 20;
		class?: string;
	} & Omit<LucideProps, 'class' | 'name' | 'size' | 'strokeWidth' | 'children'> = $props();

	const Glyph = $derived(ICONS[name]);
</script>

<Glyph {size} strokeWidth={1.75} class="shrink-0 {className}" {...rest} />
