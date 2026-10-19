<script lang="ts">
	import ContactsApp from '$lib/components/contacts/ContactsApp.svelte';

	let { data } = $props();
</script>

<ContactsApp initial={data.contacts} />
