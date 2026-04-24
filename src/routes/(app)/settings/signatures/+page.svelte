<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import SettingsPlaceholder from '$lib/components/SettingsPlaceholder.svelte';
</script>

<svelte:head><title>{pageTitle({ page: 'Signatures', subtitle: 'Settings' })}</title></svelte:head>

<SettingsPlaceholder
	title="Signatures"
	description="Manage signatures for your outgoing mail."
	comingIn="Full signature management — create, edit, set a default, rich text formatting — is coming in Phase 15. For now, the Account page holds a single plain-text signature that's appended to all outgoing mail."
/>
