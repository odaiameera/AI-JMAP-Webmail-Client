<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { DEFAULT_LABEL_COLOR, colorByHex, type LabelColor } from '$lib/constants/colors';
	import ColorGrid from '$lib/components/modals/ColorGrid.svelte';
	import { apiCreateCalendar, apiUpdateCalendar } from '$lib/calendar/api';
	import type { CalendarInfo } from '$lib/calendar/types';

	let {
		open,
		editing = null,
		onClose
	}: {
		open: boolean;
		editing?: CalendarInfo | null;
		onClose: () => void;
	} = $props();

	let name = $state('');
	let color = $state<LabelColor>(DEFAULT_LABEL_COLOR);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let previousOpen = false;

	const isEdit = $derived(!!editing);
	const title = $derived(isEdit ? 'Edit calendar' : 'New calendar');

	$effect(() => {
		if (open && !previousOpen) {
			if (editing) {
				name = editing.name;
				color = colorByHex(editing.color);
			} else {
				name = '';
				color = DEFAULT_LABEL_COLOR;
			}
			error = null;
			setTimeout(() => inputEl?.focus(), 0);
		}
		previousOpen = open;
	});

	async function handleSave() {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Name is required';
			return;
		}
		saving = true;
		error = null;
		try {
			const res = editing
				? await apiUpdateCalendar(editing.id, {
						...(trimmed !== editing.name ? { name: trimmed } : {}),
						...(color.hex.toLowerCase() !== editing.color.toLowerCase() ? { color: color.hex } : {})
					})
				: await apiCreateCalendar(trimmed, color.hex);
			if (!res.ok) throw new Error(res.error);
			await invalidateAll();
			onClose();
		} catch (e) {
			error = (e as Error).message ?? 'Something went wrong';
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (!saving) onClose();
		} else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'INPUT') {
			e.preventDefault();
			handleSave();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="calendar-modal-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget && !saving) onClose();
		}}
		onkeydown={handleKeydown}
	>
		<div
			class="bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
			role="document"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 id="calendar-modal-title" class="text-lg font-semibold text-text">{title}</h2>
				<button
					type="button"
					class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
					onclick={() => !saving && onClose()}
					aria-label="Close"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-5">
				<div>
					<label class="block text-sm font-medium text-text mb-2" for="calendar-name">Calendar name</label>
					<input
						id="calendar-name"
						type="text"
						bind:value={name}
						bind:this={inputEl}
						maxlength={100}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
						placeholder="Calendar name"
					/>
				</div>

				<div>
					<div class="flex items-baseline gap-2 mb-3">
						<span class="text-sm font-medium text-text">Color:</span>
						<span class="text-sm text-text-secondary">{colorByHex(color.hex).name}</span>
					</div>
					<ColorGrid value={color} onChange={(c) => (color = c)} />
				</div>

				{#if error}
					<div class="text-sm text-danger" aria-live="polite">{error}</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
				<button
					type="button"
					class="px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer disabled:opacity-60"
					onclick={() => onClose()}
					disabled={saving}
				>
					Cancel
				</button>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
					onclick={handleSave}
					disabled={saving || !name.trim()}
				>
					{#if saving}
						<span class="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
					{/if}
					Save
				</button>
			</div>
		</div>
	</div>
{/if}
