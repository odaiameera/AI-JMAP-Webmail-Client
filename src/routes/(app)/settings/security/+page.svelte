<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import SettingsPlaceholder from '$lib/components/SettingsPlaceholder.svelte';
</script>

<svelte:head><title>{pageTitle({ page: 'Security', subtitle: 'Settings' })}</title></svelte:head>

<SettingsPlaceholder
	title="Security"
	description="Manage your webmail password, passkeys, and active sessions."
	comingIn="Native security management is coming in a future phase. Today, your webmail signs in using your Stalwart mail credentials directly. Separate webmail password, passkeys, and session management are on the roadmap."
/>
