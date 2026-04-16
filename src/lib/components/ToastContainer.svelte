<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';

	function handleAction(id: string, run: () => void) {
		run();
		dismissToast(id);
	}
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
	{#each $toasts as toast (toast.id)}
		<div
			role="status"
			aria-live="polite"
			class="pointer-events-auto bg-surface border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3"
			in:fly={{ y: 12, duration: 180 }}
			out:fly={{ y: 12, duration: 120 }}
		>
			<span class="text-sm text-text flex-1 min-w-0">{toast.message}</span>
			{#if toast.action}
				<button
					onclick={() => handleAction(toast.id, toast.action!.onClick)}
					class="text-xs font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer shrink-0"
				>
					{toast.action.label}
				</button>
			{/if}
			<button
				onclick={() => dismissToast(toast.id)}
				title="Dismiss"
				class="p-1 rounded text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/each}
</div>
