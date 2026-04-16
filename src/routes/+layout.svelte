<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#6366F1" />
</svelte:head>
{@render children()}
