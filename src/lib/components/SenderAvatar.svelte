<script lang="ts">
	import { avatarColor, initial, normalizeEmail } from '$lib/utils/avatar';

	let {
		email,
		name = '',
		size = 32
	}: {
		email: string | null | undefined;
		name?: string | null;
		size?: number;
	} = $props();

	const normalized = $derived(normalizeEmail(email));
	const letter = $derived(initial(name, normalized));
	const bg = $derived(avatarColor(normalized || letter));
	const src = $derived(normalized ? `/api/avatar?email=${encodeURIComponent(normalized)}` : '');

	// The initials chip is the base layer; the avatar image fades in on top
	// once it loads. On error (204 "no avatar" / network) the image stays
	// transparent and the initials show through — we never unmount the <img>,
	// so a reused row instance can still display an avatar that resolves on a
	// later mount. Reset when the sender (src) changes.
	let loaded = $state(false);
	$effect(() => {
		src;
		loaded = false;
	});
</script>

<div
	class="relative rounded-full overflow-hidden select-none shrink-0"
	style="width:{size}px;height:{size}px"
>
	<!--
		Initials chip. Its colour is hashed from the address, so it is a
		different hue per sender — fine as a standalone fallback, wrong as a
		backdrop. It is hidden the moment a real avatar loads (see below).
	-->
	<div
		class="absolute inset-0 flex items-center justify-center text-white font-semibold transition-opacity duration-150"
		style="background-color:{bg};font-size:{Math.round(size * 0.42)}px;opacity:{loaded ? 0 : 1}"
		aria-hidden="true"
	>
		{letter}
	</div>
	{#if src}
		<!--
			Two things matter once an avatar loads.

			The plate underneath is white, not the hashed chip. A great many
			brand marks are transparent PNGs or SVGs, and the chip used to show
			through them — a random hue behind a logo that was drawn for a white
			background, clashing more often than not. White is what those marks
			are designed against, and an opaque photo covers it entirely, so it
			only ever shows where it helps.

			`object-contain`, not `cover`: cover crops to fill the circle, which
			eats the edges of a wide wordmark. Square sources (almost all
			favicons and every Gravatar) render identically either way, so
			contain costs nothing and saves the rest. The small inset keeps a
			full-bleed mark off the exact rim of the circle.

			The hairline ring is what stops a white plate from disappearing into
			a white row in light mode — without it the disc has no edge and the
			mark just floats.
		-->
		<img
			{src}
			alt=""
			width={size}
			height={size}
			loading="lazy"
			decoding="async"
			class="absolute inset-0 w-full h-full bg-white object-contain transition-opacity duration-150"
			style="opacity:{loaded ? 1 : 0};padding:{Math.max(1, Math.round(size * 0.06))}px;box-shadow:inset 0 0 0 1px var(--color-border)"
			draggable="false"
			onload={() => (loaded = true)}
			onerror={() => (loaded = false)}
		/>
	{/if}
</div>
