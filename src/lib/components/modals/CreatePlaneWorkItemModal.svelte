<script lang="ts">
	interface PlaneProject {
		id: string;
		name: string;
		identifier: string;
	}

	type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

	let {
		open,
		initialTitle = '',
		initialDescriptionMd = '',
		onClose,
		onCreated
	}: {
		open: boolean;
		initialTitle?: string;
		initialDescriptionMd?: string;
		onClose: () => void;
		onCreated?: (issue: { id: string; sequence_id: number; url: string }) => void;
	} = $props();

	let title = $state('');
	let descriptionMd = $state('');
	let priority = $state<Priority>('none');
	let projectId = $state<string>('');
	let projects = $state<PlaneProject[]>([]);
	let loadingProjects = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let previousOpen = false;

	async function fetchProjects() {
		loadingProjects = true;
		error = null;
		try {
			const res = await fetch('/api/plane/projects');
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
			projects = data.projects ?? [];
			if (!projectId && projects.length > 0) projectId = projects[0].id;
		} catch (e) {
			error = (e as Error).message ?? 'Failed to load projects';
			projects = [];
		} finally {
			loadingProjects = false;
		}
	}

	$effect(() => {
		if (open && !previousOpen) {
			title = initialTitle;
			descriptionMd = initialDescriptionMd;
			priority = 'none';
			error = null;
			projectId = '';
			projects = [];
			fetchProjects();
			setTimeout(() => inputEl?.focus(), 0);
		}
		previousOpen = open;
	});

	async function handleSave() {
		const trimmed = title.trim();
		if (!trimmed) {
			error = 'Title is required';
			return;
		}
		if (!projectId) {
			error = 'Pick a project';
			return;
		}
		saving = true;
		error = null;
		try {
			const res = await fetch('/api/plane/work-items', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectId,
					title: trimmed,
					descriptionMd,
					priority: priority === 'none' ? undefined : priority
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data?.issue) {
				throw new Error(data?.error ?? `HTTP ${res.status}`);
			}
			onCreated?.(data.issue);
			onClose();
		} catch (e) {
			error = (e as Error).message ?? 'Failed to create work item';
		} finally {
			saving = false;
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
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-plane-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) handleCancel();
		}}
		onkeydown={handleKeydown}
	>
		<div
			class="bg-surface border border-border rounded-xl w-full max-w-lg mx-4 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
			role="document"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 id="create-plane-title" class="text-lg font-semibold text-text">
					Create Plane work item
				</h2>
				<button
					type="button"
					class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
					onclick={handleCancel}
					aria-label="Close"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-5">
				<div>
					<label class="block text-sm font-medium text-text mb-2" for="plane-project">Project</label>
					<select
						id="plane-project"
						bind:value={projectId}
						disabled={loadingProjects || saving}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors disabled:opacity-60"
					>
						{#if loadingProjects}
							<option value="">Loading projects…</option>
						{:else if projects.length === 0}
							<option value="">No projects available</option>
						{:else}
							{#each projects as p}
								<option value={p.id}>{p.name} ({p.identifier})</option>
							{/each}
						{/if}
					</select>
				</div>

				<div>
					<label class="block text-sm font-medium text-text mb-2" for="plane-title">Title</label>
					<input
						id="plane-title"
						type="text"
						bind:value={title}
						bind:this={inputEl}
						maxlength={255}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
						placeholder="What needs doing?"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-text mb-2" for="plane-priority">Priority</label>
					<select
						id="plane-priority"
						bind:value={priority}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors"
					>
						<option value="none">None</option>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="urgent">Urgent</option>
					</select>
				</div>

				<div>
					<label class="block text-sm font-medium text-text mb-2" for="plane-description">
						Description
					</label>
					<textarea
						id="plane-description"
						bind:value={descriptionMd}
						rows={10}
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors font-mono"
						placeholder="Notes, context, links…"
					></textarea>
					<p class="text-[11px] text-text-tertiary mt-1">
						Markdown supported. Rendered as rich text in Plane.
					</p>
				</div>

				{#if error}
					<div class="text-sm text-red-400" aria-live="polite">{error}</div>
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
					disabled={saving || !title.trim() || !projectId}
				>
					{#if saving}
						<span
							class="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"
						></span>
					{/if}
					{saving ? 'Creating…' : 'Create work item'}
				</button>
			</div>
		</div>
	</div>
{/if}
