<script lang="ts">
	import { userState, type IdentityValue } from '$lib/stores/userState';
	import { composer, setFromIdentity } from '$lib/stores/compose';

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

	function handleChange(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		setFromIdentity(id);
	}

	function formatLabel(i: IdentityValue): string {
		return i.name ? `${i.name} <${i.email}>` : i.email;
	}
</script>

{#if identities.length > 1}
	<div class="flex items-center px-3 py-1.5 border-b border-border/50">
		<span class="text-xs text-text-tertiary w-12 shrink-0">From</span>
		<select
			value={currentIdentity?.jmapId ?? ''}
			onchange={handleChange}
			aria-label="From address"
			class="flex-1 bg-transparent text-sm text-text outline-none cursor-pointer hover:text-accent transition-colors"
		>
			{#each identities as identity (identity.jmapId)}
				<option value={identity.jmapId}>
					{formatLabel(identity)}{identity.isPrimary ? ' — primary' : ''}
				</option>
			{/each}
		</select>
	</div>
{/if}
