<script lang="ts">
	let {
		title,
		description,
		comingIn
	}: {
		title: string;
		description: string;
		comingIn: string;
	} = $props();
</script>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">{title}</h1>
	<p class="text-sm text-text-tertiary mt-1 max-w-prose">{description}</p>
</header>

<section class="rounded-xl border border-border bg-surface-hover/40 p-5">
	<p class="text-sm text-text-secondary leading-relaxed">{comingIn}</p>
</section>
