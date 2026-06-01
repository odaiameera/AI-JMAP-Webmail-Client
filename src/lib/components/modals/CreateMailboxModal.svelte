<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Mailbox } from '$lib/jmap/types';
	import {
		DEFAULT_LABEL_COLOR,
		colorByHex,
		type LabelColor
	} from '$lib/constants/colors';
	import { setFolderMeta, setLabelMeta } from '$lib/stores/userState';
	import ColorGrid from './ColorGrid.svelte';
	import FolderLocationPicker from './FolderLocationPicker.svelte';

	export type EditingMailbox = {
		id: string;
		name: string;
		color: LabelColor;
		parentId?: string | null;
	};

	let {
		kind,
		open,
		mailboxes,
		editing = null,
		onClose
	}: {
		kind: 'folder' | 'label';
		open: boolean;
		mailboxes: Mailbox[];
		editing?: EditingMailbox | null;
		onClose: () => void;
	} = $props();

	let name = $state('');
	let color = $state<LabelColor>(DEFAULT_LABEL_COLOR);
	let parentId = $state<string | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let previousOpen = false;

	const isEdit = $derived(!!editing);
	const title = $derived(
		isEdit
			? kind === 'folder'
				? 'Edit folder'
				: 'Edit label'
			: kind === 'folder'
				? 'Create folder'
				: 'Create label'
	);
	const subtitle = $derived(
		kind === 'folder' && !isEdit
			? 'Name your new folder and select the parent folder you want to put it in. If you do not select a parent folder, this new folder will be created as a top level folder.'
			: null
	);
	const nameLabel = $derived(kind === 'folder' ? 'Folder name' : 'Label name');
	const submitLabel = $derived(isEdit ? 'Save' : saving ? 'Saving…' : 'Save');

	// Reset form state every time the modal opens. `previousOpen` prevents
	// clobbering in-flight typing on re-renders where `open` didn't flip.
	$effect(() => {
		if (open && !previousOpen) {
			if (editing) {
				name = editing.name;
				color = editing.color;
				parentId = editing.parentId ?? null;
			} else {
				name = '';
				color = DEFAULT_LABEL_COLOR;
				parentId = null;
			}
			error = null;
			setTimeout(() => inputEl?.focus(), 0);
		}
		previousOpen = open;
	});

	async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: any }> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data?.success === false) {
			return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
		}
		return { ok: true, data };
	}

	async function handleSave() {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Name is required';
			return;
		}
		saving = true;
		error = null;
		try {
			if (isEdit && editing) {
				await saveEdit(editing, trimmed);
			} else {
				await saveCreate(trimmed);
			}
			await invalidateAll();
			onClose();
		} catch (e) {
			error = (e as Error).message ?? 'Something went wrong';
		} finally {
			saving = false;
		}
	}

	async function saveCreate(trimmed: string) {
		if (kind === 'folder') {
			const res = await postJson('/api/folders', {
				action: 'create',
				name: trimmed,
				parentId
			});
			if (!res.ok) throw new Error(res.error);
			const id: string | undefined = res.data?.id;
			if (id) {
				await setFolderMeta(id, { displayName: trimmed, color: color.hex });
			}
		} else {
			const res = await postJson('/api/preferences/labels', {
				action: 'create',
				name: trimmed,
				color: color.hex
			});
			if (!res.ok) throw new Error(res.error);
			const id: string | undefined = res.data?.id;
			if (id) {
				await setLabelMeta(id, { displayName: trimmed, color: color.hex });
			}
		}
	}

	async function saveEdit(target: EditingMailbox, trimmed: string) {
		const nameChanged = trimmed !== target.name;
		const colorChanged = color.hex.toLowerCase() !== target.color.hex.toLowerCase();
		const parentChanged =
			kind === 'folder' && (parentId ?? null) !== (target.parentId ?? null);

		if (kind === 'folder') {
			if (nameChanged) {
				const r = await postJson('/api/folders', { action: 'rename', id: target.id, name: trimmed });
				if (!r.ok) throw new Error(r.error);
			}
			if (parentChanged) {
				const r = await postJson('/api/folders', {
					action: 'move',
					id: target.id,
					newParentId: parentId
				});
				if (!r.ok) throw new Error(r.error);
			}
			if (nameChanged || colorChanged) {
				await setFolderMeta(target.id, { displayName: trimmed, color: color.hex });
			}
		} else {
			if (nameChanged) {
				const r = await postJson('/api/preferences/labels', {
					action: 'rename',
					id: target.id,
					name: trimmed
				});
				if (!r.ok) throw new Error(r.error);
			}
			if (colorChanged) {
				const r = await postJson('/api/preferences/labels', {
					action: 'updateColor',
					id: target.id,
					color: color.hex
				});
				if (!r.ok) throw new Error(r.error);
			}
			if (nameChanged || colorChanged) {
				await setLabelMeta(target.id, { displayName: trimmed, color: color.hex });
			}
		}
	}

	function handleCancel() {
		if (saving) return;
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancel();
		} else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'INPUT') {
			e.preventDefault();
			handleSave();
		}
	}

	const colorName = $derived(colorByHex(color.hex).name);
</script>

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-mailbox-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) handleCancel();
		}}
		onkeydown={handleKeydown}
	>
		<div
			class="bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
			role="document"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 id="create-mailbox-title" class="text-lg font-semibold text-text">
					{title}
				</h2>
				<button
					type="button"
					class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
					onclick={handleCancel}
					aria-label="Close"
				>
					<svg
						class="w-5 h-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{#if subtitle}
				<p class="text-sm text-text-secondary mb-5 leading-relaxed">{subtitle}</p>
			{/if}

			<div class="space-y-5">
				<div>
					<label class="block text-sm font-medium text-text mb-2" for="mailbox-name">
						{nameLabel}
					</label>
					<input
						id="mailbox-name"
						type="text"
						bind:value={name}
						bind:this={inputEl}
						maxlength={kind === 'label' ? 64 : 100}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
						placeholder={nameLabel}
					/>
				</div>

				{#if kind === 'folder'}
					<div>
						<label class="block text-sm font-medium text-text mb-2" for="mailbox-parent">
							Folder location
						</label>
						<FolderLocationPicker
							{mailboxes}
							excludeId={editing?.id ?? null}
							value={parentId}
							onChange={(id) => (parentId = id)}
						/>
					</div>
				{/if}

				<div>
					<div class="flex items-baseline gap-2 mb-3">
						<span class="text-sm font-medium text-text">Color:</span>
						<span class="text-sm text-text-secondary">{colorName}</span>
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
					onclick={handleCancel}
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
						<span
							class="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"
						></span>
					{/if}
					{submitLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
