<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import SettingsPlaceholder from '$lib/components/SettingsPlaceholder.svelte';
</script>

<svelte:head><title>{pageTitle({ page: 'Keyboard shortcuts', subtitle: 'Settings' })}</title></svelte:head>

<SettingsPlaceholder
	title="Keyboard shortcuts"
	description="A reference for Ameera's keyboard shortcuts."
	comingIn="Full reference coming in a later phase. Shortcuts can be toggled on or off from the Messages page (Keyboard shortcuts setting)."
/>
