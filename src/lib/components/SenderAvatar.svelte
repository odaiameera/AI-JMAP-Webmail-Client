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

	// The initials chip is always rendered as the base layer; the avatar image
	// fades in on top once it loads. On error (204 "no avatar" / network) the
	// image just stays transparent and the initials show through — we never
	// unmount the <img>, so a reused row instance can still display an avatar
	// that resolves on a later mount. Reset when the sender (src) changes.
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
	<div
		class="absolute inset-0 flex items-center justify-center text-white font-semibold"
		style="background-color:{bg};font-size:{Math.round(size * 0.42)}px"
		aria-hidden="true"
	>
		{letter}
	</div>
	{#if src}
		<img
			{src}
			alt=""
			width={size}
			height={size}
			loading="lazy"
			decoding="async"
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-150"
			style="opacity:{loaded ? 1 : 0}"
			draggable="false"
			onload={() => (loaded = true)}
			onerror={() => (loaded = false)}
		/>
	{/if}
</div>
