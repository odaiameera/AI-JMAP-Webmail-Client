<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pageTitle } from '$lib/utils/title';
	import type { LayoutData } from '../$types';
	import type { Mailbox } from '$lib/jmap/types';
	import { LABEL_PREFIX } from '$lib/types/labels';
	import { userState } from '$lib/stores/userState';
	import { colorByHex, DEFAULT_LABEL_COLOR, type LabelColor } from '$lib/constants/colors';
	import { buildFolderTree, flattenFolderTree } from '$lib/utils/folder-tree';
	import CreateMailboxModal from '$lib/components/modals/CreateMailboxModal.svelte';

	type EditingMailbox = {
		id: string;
		name: string;
		color: LabelColor;
		parentId?: string | null;
	};

	let { data }: { data: LayoutData } = $props();

	const userFolders = $derived(
		data.mailboxes.filter((m) => m.role === null && !m.name.startsWith(LABEL_PREFIX))
	);
	const systemFolders = $derived(data.mailboxes.filter((m) => m.role !== null));

	// Flat ordered list honoring the folder tree, with depth for indentation.
	const flatFolders = $derived(flattenFolderTree(buildFolderTree(data.mailboxes)));
	const folderById = $derived(new Map(userFolders.map((m) => [m.id, m])));

	let modalOpen = $state(false);
	let modalEditing = $state<EditingMailbox | null>(null);

	function openCreate() {
		modalEditing = null;
		modalOpen = true;
	}

	function openEdit(folder: Mailbox) {
		const meta = $userState.folders.get(folder.id);
		modalEditing = {
			id: folder.id,
			name: folder.name,
			color: meta?.color ? colorByHex(meta.color) : DEFAULT_LABEL_COLOR,
			parentId: folder.parentId
		};
		modalOpen = true;
	}

	async function deleteFolder(folder: Mailbox) {
		const msg = `Delete "${folder.name}"? Messages inside will not be deleted — move them first if you want to keep them somewhere else.`;
		if (!confirm(msg)) return;
		const res = await fetch('/api/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete', id: folder.id })
		});
		const payload = await res.json().catch(() => ({}));
		if (!res.ok || payload?.success === false) {
			alert(payload?.error ?? 'Failed to delete folder');
			return;
		}
		if (page.url.pathname === `/folder/${folder.id}`) {
			goto('/inbox');
		}
		await invalidateAll();
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Folders', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6 flex items-start justify-between gap-4">
	<div>
		<h1 class="text-xl font-semibold text-text">Folders</h1>
		<p class="text-sm text-text-tertiary mt-1 max-w-prose">
			Folders are real JMAP mailboxes — they show up in Apple Mail, Outlook, and any other client
			connected to the same account. Create, rename, recolor, and reparent them here.
		</p>
	</div>
	<button
		type="button"
		onclick={openCreate}
		class="shrink-0 inline-flex items-center gap-1.5 text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
		New folder
	</button>
</header>

<section class="flex flex-col gap-5">
	<div>
		<h2 class="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Your folders</h2>
		{#if flatFolders.length === 0}
			<p class="text-sm text-text-tertiary">No user folders yet.</p>
		{:else}
			<div class="flex flex-col gap-1.5">
				{#each flatFolders as opt (opt.id)}
					{@const folder = folderById.get(opt.id)}
					{#if folder}
						{@const meta = $userState.folders.get(folder.id)}
						<div
							class="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover/50 border border-border/60"
							style="padding-left: {12 + opt.depth * 16}px"
						>
							<span
								class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
								style="background-color: {meta?.color ?? '#6b7280'}"
							></span>
							<span class="flex-1 truncate text-sm text-text">{folder.name}</span>
							{#if folder.unreadEmails > 0}
								<span class="text-xs text-text-tertiary shrink-0">{folder.unreadEmails} unread</span>
							{/if}
							<a
								href={`/folder/${folder.id}`}
								class="text-xs text-text-tertiary hover:text-text transition-colors"
							>View →</a>
							<button
								type="button"
								onclick={() => openEdit(folder)}
								class="text-xs text-text-tertiary hover:text-text px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer"
							>Edit</button>
							<button
								type="button"
								onclick={() => deleteFolder(folder)}
								class="text-xs text-text-tertiary hover:text-danger px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer"
							>Delete</button>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<div>
		<h2 class="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">System folders</h2>
		<p class="text-xs text-text-tertiary mb-2">These are managed by the server and can't be renamed or deleted.</p>
		<div class="flex flex-col gap-1.5">
			{#each systemFolders as mb (mb.id)}
				<div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover/30 border border-border/40">
					<span class="flex-1 truncate text-sm text-text-secondary">{mb.name}</span>
					<span class="text-[10px] text-text-tertiary uppercase tracking-wider">{mb.role ?? ''}</span>
				</div>
			{/each}
		</div>
	</div>
</section>

<CreateMailboxModal
	kind="folder"
	open={modalOpen}
	mailboxes={data.mailboxes}
	editing={modalEditing}
	onClose={() => { modalOpen = false; modalEditing = null; }}
/>
