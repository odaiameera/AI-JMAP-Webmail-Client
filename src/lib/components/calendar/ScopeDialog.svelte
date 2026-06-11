<script lang="ts">
	import type { EditScope } from '$lib/calendar/types';

	let {
		open,
		action,
		onResolve
	}: {
		open: boolean;
		/** 'edit' | 'delete' — only changes the copy. */
		action: 'edit' | 'delete';
		onResolve: (scope: EditScope | null) => void;
	} = $props();

	let scope = $state<EditScope>('instance');
	let previousOpen = false;

	$effect(() => {
		if (open && !previousOpen) scope = 'instance';
		previousOpen = open;
	});

	const options: { value: EditScope; label: string }[] = [
		{ value: 'instance', label: 'This event' },
		{ value: 'following', label: 'This and following events' },
		{ value: 'all', label: 'All events' }
	];
</script>

{#if open}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="scope-dialog-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) onResolve(null);
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onResolve(null);
			}
		}}
	>
		<div class="bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]" role="document">
			<h2 id="scope-dialog-title" class="text-base font-semibold text-text mb-4">
				{action === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}
			</h2>

			<div class="flex flex-col gap-2.5 mb-6">
				{#each options as opt (opt.value)}
					<label class="flex items-center gap-2.5 cursor-pointer">
						<input
							type="radio"
							name="edit-scope"
							value={opt.value}
							checked={scope === opt.value}
							onchange={() => (scope = opt.value)}
							class="accent-accent cursor-pointer"
						/>
						<span class="text-sm text-text">{opt.label}</span>
					</label>
				{/each}
			</div>

			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
					onclick={() => onResolve(null)}
				>
					Cancel
				</button>
				<button
					type="button"
					class="px-4 py-2 text-sm text-white rounded-lg transition-colors cursor-pointer {action === 'delete'
						? 'bg-danger hover:opacity-90'
						: 'bg-accent hover:bg-accent-hover'}"
					onclick={() => onResolve(scope)}
				>
					{action === 'delete' ? 'Delete' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}
