<script lang="ts">
	import { userState, type IdentityValue } from '$lib/stores/userState';
	import { composer, setFromIdentity } from '$lib/stores/compose';
	import MenuSelect from '$lib/components/MenuSelect.svelte';

	const identities = $derived($userState.identities);
	const currentId = $derived($composer.fromIdentityId);

	// Resolve current selection. If the compose was initialised before
	// userState loaded, fromIdentityId can be null — fall back to primary
	// for display purposes without writing back to the store yet (the
	// auto-default effect in ComposerShell will set it next tick).
	const currentIdentity = $derived<IdentityValue | null>(
		identities.find((i) => i.jmapId === currentId) ??
			identities.find((i) => i.isPrimary) ??
			identities[0] ??
			null
	);

	// The address is what tells identities apart; the name only joins it
	// when the identities don't all share one.
	const sameName = $derived(new Set(identities.map((i) => i.name)).size <= 1);
	const options = $derived(
		identities.map((i) => ({
			value: i.jmapId,
			label: i.email,
			detail: sameName ? undefined : (i.name ?? undefined)
		}))
	);
</script>

{#if identities.length > 1}
	<div class="flex items-center pl-3 pr-2 py-1 border-b border-border/50">
		<span class="text-xs text-text-tertiary w-12 shrink-0">From</span>
		<!-- Pulled left by the button's own padding so the address lines up
		     with the To and Subject text below it. On a wrapper, not the
		     button: a negative margin there shrinks the menu's box and clips
		     the address. -->
		<div class="-ml-2 min-w-0">
			<MenuSelect
				value={currentIdentity?.jmapId ?? ''}
				{options}
				onChange={(id) => setFromIdentity(id)}
				ariaLabel="From address"
			/>
		</div>
	</div>
{/if}
