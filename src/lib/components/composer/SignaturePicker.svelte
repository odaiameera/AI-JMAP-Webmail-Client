<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { userState } from '$lib/stores/userState';
	import { composer, setSignature } from '$lib/stores/compose';
	import MenuSelect from '$lib/components/MenuSelect.svelte';

	const options = $derived([
		{ value: null as number | null, label: 'No signature' },
		...$userState.signatures.map((sig) => ({ value: sig.id as number | null, label: sig.name }))
	]);
</script>

{#snippet penIcon()}
	<Icon name="signature" size={14} class="text-text-tertiary" />
{/snippet}

<MenuSelect
	value={$composer.signatureId}
	{options}
	onChange={(id) => setSignature(id, true)}
	ariaLabel="Signature"
	icon={penIcon}
	align="right"
	placement="up"
	triggerClass="text-xs"
/>
