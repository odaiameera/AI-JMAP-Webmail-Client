<script lang="ts">
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { openCompose } from '$lib/stores/compose';
	import {
		createFolderExpandedStore,
		isExpandedDefault,
		SECTION_FOLDERS,
		SECTION_LABELS
	} from '$lib/stores/folderExpanded';
	import type { Mailbox } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { LABEL_PREFIX } from '$lib/types/labels';

	let {
		mailboxes,
		labels = [],
		folderExpanded = {},
		hideHeader = false,
		collapsed = false,
		onToggleCollapse
	}: {
		mailboxes: Mailbox[];
		labels?: Label[];
		folderExpanded?: Record<string, boolean>;
		hideHeader?: boolean;
		collapsed?: boolean;
		onToggleCollapse?: () => void;
	} = $props();

	const expanded = createFolderExpandedStore(folderExpanded);

	// --- Mailbox classification ---

	const systemOrder: Record<string, number> = {
		inbox: 0, drafts: 1, sent: 2, archive: 3, junk: 4, trash: 5
	};

	const systemFolders = $derived(
		mailboxes
			.filter((m) => m.role !== null && m.name !== 'Sent Messages')
			.sort((a, b) => {
				const ao = systemOrder[a.role ?? ''] ?? 10;
				const bo = systemOrder[b.role ?? ''] ?? 10;
				if (ao !== bo) return ao - bo;
				return a.sortOrder - b.sortOrder;
			})
	);

	const userFolders = $derived(
		mailboxes.filter((m) => m.role === null && !m.name.startsWith(LABEL_PREFIX))
	);

	// Flat list of user folders for the parent picker (indented display names).
	const userFolderOptions = $derived.by(() => {
		const byId = new Map(userFolders.map((m) => [m.id, m]));
		function depthOf(id: string | null, seen = new Set<string>()): number {
			if (!id || seen.has(id)) return 0;
			seen.add(id);
			const parent = byId.get(id);
			if (!parent?.parentId || !byId.has(parent.parentId)) return 0;
			return depthOf(parent.parentId, seen) + 1;
		}
		return userFolders
			.map((m) => ({ id: m.id, name: m.name, depth: depthOf(m.parentId) }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	type FolderNode = Mailbox & { children: FolderNode[] };

	const userFolderTree = $derived.by<FolderNode[]>(() => {
		const byId = new Map<string, FolderNode>(
			userFolders.map((m) => [m.id, { ...m, children: [] }])
		);
		const roots: FolderNode[] = [];
		for (const node of byId.values()) {
			const parent = node.parentId ? byId.get(node.parentId) : undefined;
			if (parent) parent.children.push(node);
			else roots.push(node);
		}
		function sortLevel(nodes: FolderNode[]) {
			nodes.sort((a, b) => a.name.localeCompare(b.name));
			for (const n of nodes) sortLevel(n.children);
		}
		sortLevel(roots);
		return roots;
	});

	function isExpanded(id: string): boolean {
		return isExpandedDefault(id, $expanded);
	}

	// --- Routing helpers ---

	function getMailboxHref(m: { id: string; role?: string | null }): string {
		if (m.role === 'inbox') return '/inbox';
		return `/folder/${m.id}`;
	}

	function isMailboxActive(m: { id: string; role?: string | null }): boolean {
		if (m.role === 'inbox') return page.url.pathname.startsWith('/inbox');
		return page.url.pathname === `/folder/${m.id}`;
	}

	function getSystemIcon(role: string | null): string {
		switch (role) {
			case 'inbox': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`;
			case 'drafts': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
			case 'sent': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
			case 'trash': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
			case 'junk': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
			case 'archive': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
			default: return folderIcon;
		}
	}

	const folderIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;

	// --- Folder CRUD UI state ---

	let showCreateFolderForm = $state(false);
	let newFolderName = $state('');
	let newFolderParentId = $state<string | null>(null);
	let creatingFolder = $state(false);
	let folderFormError = $state('');

	let renamingFolderId = $state<string | null>(null);
	let renameFolderName = $state('');
	let savingRename = $state(false);

	// --- Label CRUD UI state ---

	let showCreateLabelForm = $state(false);
	let newLabelName = $state('');
	let newLabelColor = $state('#6366F1');
	let creatingLabel = $state(false);
	let labelFormError = $state('');

	// --- API helpers ---

	async function postJson(url: string, body: unknown): Promise<{ success: boolean; error?: string }> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data?.success === false) {
			return { success: false, error: data?.error ?? `HTTP ${res.status}` };
		}
		return { success: true };
	}

	async function createFolder() {
		const name = newFolderName.trim();
		if (!name) return;
		folderFormError = '';
		creatingFolder = true;
		try {
			const res = await postJson('/api/folders', {
				action: 'create',
				name,
				parentId: newFolderParentId
			});
			if (!res.success) {
				folderFormError = res.error ?? 'Failed to create folder';
				return;
			}
			await invalidateAll();
			newFolderName = '';
			newFolderParentId = null;
			showCreateFolderForm = false;
			expanded.set(SECTION_FOLDERS, true);
		} finally {
			creatingFolder = false;
		}
	}

	function cancelCreateFolder() {
		showCreateFolderForm = false;
		newFolderName = '';
		newFolderParentId = null;
		folderFormError = '';
	}

	function startRename(folder: Mailbox) {
		renamingFolderId = folder.id;
		renameFolderName = folder.name;
	}

	async function commitRename(id: string) {
		const name = renameFolderName.trim();
		const target = mailboxes.find((m) => m.id === id);
		if (!name || name === target?.name) {
			renamingFolderId = null;
			return;
		}
		savingRename = true;
		try {
			const res = await postJson('/api/folders', { action: 'rename', id, name });
			if (res.success) {
				await invalidateAll();
			}
		} finally {
			savingRename = false;
			renamingFolderId = null;
		}
	}

	async function deleteFolder(folder: Mailbox) {
		const msg = `Delete "${folder.name}"? Messages inside will not be deleted — move them first if you want to keep them somewhere else.`;
		if (!confirm(msg)) return;
		const res = await postJson('/api/folders', { action: 'delete', id: folder.id });
		if (!res.success) {
			alert(res.error ?? 'Failed to delete folder');
			return;
		}
		if (page.url.pathname === `/folder/${folder.id}`) {
			goto('/inbox');
		}
		await invalidateAll();
	}

	async function createLabel() {
		const name = newLabelName.trim();
		if (!name) return;
		labelFormError = '';
		creatingLabel = true;
		try {
			const res = await postJson('/api/preferences/labels', {
				action: 'create',
				name,
				color: newLabelColor
			});
			if (!res.success) {
				labelFormError = res.error ?? 'Failed to create label';
				return;
			}
			await invalidateAll();
			newLabelName = '';
			newLabelColor = '#6366F1';
			showCreateLabelForm = false;
			expanded.set(SECTION_LABELS, true);
		} finally {
			creatingLabel = false;
		}
	}

	function cancelCreateLabel() {
		showCreateLabelForm = false;
		newLabelName = '';
		newLabelColor = '#6366F1';
		labelFormError = '';
	}

	function isLabelActive(label: Label): boolean {
		return page.url.pathname === `/folder/${label.id}`;
	}

	// Active-label lookup so we can show unread badges on labels. Each label
	// id *is* a mailbox id, so we join to the mailbox list.
	function getLabelUnread(id: string): number {
		const m = mailboxes.find((mb) => mb.id === id);
		return m?.unreadEmails ?? 0;
	}
</script>

<aside class="w-full h-full bg-surface flex flex-col overflow-hidden">
	{#if !hideHeader && !collapsed}
		<div class="px-4 py-3">
			<h1 class="text-lg font-bold text-text tracking-tight leading-none">ameera.</h1>
		</div>
	{/if}

	<!-- Compose -->
	<div class="{collapsed ? 'px-1.5 pt-2' : 'px-3 pt-2'} pb-1 mb-1">
		{#if collapsed}
			<button
				onclick={() => openCompose()}
				class="w-full aspect-square bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center justify-center transition-colors cursor-pointer"
				title="Compose"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
					<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
				</svg>
			</button>
		{:else}
			<button
				onclick={() => openCompose()}
				class="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors cursor-pointer"
			>
				Compose
			</button>
		{/if}
	</div>

	{#if collapsed}
		<!-- Collapsed: flat icon list, tooltips only -->
		<nav class="flex-1 overflow-y-auto py-1 px-1.5 flex flex-col gap-0.5">
			{#each systemFolders as mailbox (mailbox.id)}
				<a
					href={getMailboxHref(mailbox)}
					title={mailbox.name}
					class="flex items-center justify-center py-2 rounded-lg transition-colors
						{isMailboxActive(mailbox)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html getSystemIcon(mailbox.role)}</span>
				</a>
			{/each}

			{#if userFolders.length > 0}
				<div class="h-px w-6 bg-border/30 mx-auto my-1"></div>
			{/if}
			{#each userFolders as mailbox (mailbox.id)}
				<a
					href={getMailboxHref(mailbox)}
					title={mailbox.name}
					class="flex items-center justify-center py-2 rounded-lg transition-colors
						{isMailboxActive(mailbox)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html folderIcon}</span>
				</a>
			{/each}

			{#if labels.length > 0}
				<div class="h-px w-6 bg-border/30 mx-auto my-1"></div>
			{/if}
			{#each labels as label (label.id)}
				<a
					href={`/folder/${label.id}`}
					title={label.name}
					class="flex items-center justify-center py-2 rounded-lg transition-colors
						{isLabelActive(label) ? 'bg-accent/10' : 'hover:bg-surface-hover'}"
				>
					<span class="w-3 h-3 rounded-full border border-white/20" style="background-color: {label.color}"></span>
				</a>
			{/each}
		</nav>
	{:else}
		<!-- Expanded: grouped, nested tree -->
		<nav class="flex-1 overflow-y-auto py-1 px-2">
			<!-- System folders -->
			{#each systemFolders as mailbox (mailbox.id)}
				<a
					href={getMailboxHref(mailbox)}
					class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
						{isMailboxActive(mailbox)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html getSystemIcon(mailbox.role)}</span>
					<span class="flex-1 truncate">{mailbox.name}</span>
					{#if mailbox.unreadEmails > 0}
						<span class="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{mailbox.unreadEmails}</span>
					{/if}
				</a>
			{/each}

			<!-- FOLDERS section -->
			<div class="mt-4 mb-1 group flex items-center justify-between pl-3 pr-1">
				<button
					onclick={() => expanded.toggle(SECTION_FOLDERS)}
					class="flex-1 flex items-center gap-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary cursor-pointer"
				>
					<span class="chevron {isExpanded(SECTION_FOLDERS) ? 'expanded' : ''}">
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</span>
					Folders
				</button>
				<button
					onclick={() => {
						showCreateFolderForm = true;
						folderFormError = '';
						expanded.set(SECTION_FOLDERS, true);
					}}
					title="New folder"
					class="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text p-1 rounded cursor-pointer transition-opacity"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				</button>
			</div>

			{#if isExpanded(SECTION_FOLDERS)}
				<div transition:slide={{ duration: 150 }}>
					{#if showCreateFolderForm}
						<div class="px-2 py-2 mx-1 mb-1 bg-surface-hover rounded-lg border border-border flex flex-col gap-1.5">
							<!-- svelte-ignore a11y_autofocus -->
							<input
								bind:value={newFolderName}
								placeholder="Folder name"
								maxlength={100}
								autofocus
								disabled={creatingFolder}
								onkeydown={(e) => {
									if (e.key === 'Enter') createFolder();
									if (e.key === 'Escape') cancelCreateFolder();
								}}
								class="bg-transparent text-sm text-text outline-none placeholder-text-tertiary"
							/>
							<select
								bind:value={newFolderParentId}
								disabled={creatingFolder || userFolderOptions.length === 0}
								class="bg-surface border border-border rounded text-xs text-text-secondary py-1 px-1.5 outline-none focus:border-accent"
							>
								<option value={null}>Top level</option>
								{#each userFolderOptions as opt}
									<option value={opt.id}>{'—'.repeat(opt.depth)} {opt.name}</option>
								{/each}
							</select>
							{#if folderFormError}
								<p class="text-[11px] text-red-400">{folderFormError}</p>
							{/if}
							<div class="flex items-center gap-1.5 pt-1">
								<button
									onclick={createFolder}
									disabled={creatingFolder || !newFolderName.trim()}
									class="inline-flex items-center gap-1.5 text-xs bg-accent text-white px-2.5 py-1 rounded hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{#if creatingFolder}
										<span class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
										Creating
									{:else}
										Create
									{/if}
								</button>
								<button
									onclick={cancelCreateFolder}
									disabled={creatingFolder}
									class="text-xs text-text-tertiary hover:text-text cursor-pointer disabled:opacity-60"
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}

					{#if userFolderTree.length === 0 && !showCreateFolderForm}
						<p class="text-[11px] text-text-tertiary/70 px-3 py-2 italic">No folders yet</p>
					{:else}
						{@render folderTree(userFolderTree, 0)}
					{/if}
				</div>
			{/if}

			<!-- LABELS section -->
			<div class="mt-4 mb-1 group flex items-center justify-between pl-3 pr-1">
				<button
					onclick={() => expanded.toggle(SECTION_LABELS)}
					class="flex-1 flex items-center gap-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary cursor-pointer"
				>
					<span class="chevron {isExpanded(SECTION_LABELS) ? 'expanded' : ''}">
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</span>
					Labels
				</button>
				<button
					onclick={() => {
						showCreateLabelForm = true;
						labelFormError = '';
						expanded.set(SECTION_LABELS, true);
					}}
					title="New label"
					class="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text p-1 rounded cursor-pointer transition-opacity"
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				</button>
			</div>

			{#if isExpanded(SECTION_LABELS)}
				<div transition:slide={{ duration: 150 }}>
					{#if showCreateLabelForm}
						<div class="px-2 py-2 mx-1 mb-1 bg-surface-hover rounded-lg border border-border flex flex-col gap-1.5">
							<div class="flex items-center gap-2">
								<input
									type="color"
									bind:value={newLabelColor}
									disabled={creatingLabel}
									class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
									title="Pick color"
								/>
								<input
									bind:value={newLabelName}
									placeholder="Label name"
									maxlength={30}
									disabled={creatingLabel}
									onkeydown={(e) => {
										if (e.key === 'Enter') createLabel();
										if (e.key === 'Escape') cancelCreateLabel();
									}}
									class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary"
								/>
							</div>
							{#if labelFormError}
								<p class="text-[11px] text-red-400">{labelFormError}</p>
							{/if}
							<div class="flex items-center gap-1.5 pt-1">
								<button
									onclick={createLabel}
									disabled={creatingLabel || !newLabelName.trim()}
									class="inline-flex items-center gap-1.5 text-xs bg-accent text-white px-2.5 py-1 rounded hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{#if creatingLabel}
										<span class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
										Creating
									{:else}
										Create
									{/if}
								</button>
								<button
									onclick={cancelCreateLabel}
									disabled={creatingLabel}
									class="text-xs text-text-tertiary hover:text-text cursor-pointer disabled:opacity-60"
								>
									Cancel
								</button>
							</div>
						</div>
					{/if}

					{#if labels.length === 0 && !showCreateLabelForm}
						<p class="text-[11px] text-text-tertiary/70 px-3 py-2 italic">No labels yet</p>
					{:else}
						{#each labels as label (label.id)}
							<a
								href={`/folder/${label.id}`}
								class="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors
									{isLabelActive(label)
										? 'bg-accent/10 text-accent'
										: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
							>
								<span class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style="background-color: {label.color}"></span>
								<span class="flex-1 truncate">{label.name}</span>
								{#if getLabelUnread(label.id) > 0}
									<span class="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{getLabelUnread(label.id)}</span>
								{/if}
							</a>
						{/each}
					{/if}
				</div>
			{/if}
		</nav>
	{/if}

	<!-- Collapse toggle -->
	<div class="py-2 {collapsed ? 'px-1.5' : 'px-2'} border-t border-border">
		<button
			onclick={() => onToggleCollapse?.()}
			class="w-full flex items-center {collapsed ? 'justify-center' : 'gap-2.5 px-3'} py-2 rounded-lg text-sm text-text-tertiary hover:bg-surface-hover hover:text-text transition-colors cursor-pointer"
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if collapsed}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				<span>Collapse</span>
			{/if}
		</button>
	</div>
</aside>

<!--
	TODO (future phase): wire drag-to-reparent. Each folder row becomes a
	drop target; on drop, POST { action: 'move', id, newParentId } to
	/api/folders. Moves under labels are already blocked server-side.
-->

{#snippet folderTree(nodes: FolderNode[], depth: number)}
	{#each nodes as node (node.id)}
		<div class="group flex items-stretch" style="padding-left: {depth * 12}px">
			{#if node.children.length > 0}
				<button
					onclick={() => expanded.toggle(node.id)}
					title={isExpanded(node.id) ? 'Collapse' : 'Expand'}
					class="flex items-center justify-center w-5 shrink-0 text-text-tertiary hover:text-text cursor-pointer"
				>
					<span class="chevron {isExpanded(node.id) ? 'expanded' : ''}">
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</span>
				</button>
			{:else}
				<span class="w-5 shrink-0"></span>
			{/if}

			{#if renamingFolderId === node.id}
				<div class="flex-1 flex items-center gap-1 pr-1">
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-text-tertiary">{@html folderIcon}</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={renameFolderName}
						autofocus
						disabled={savingRename}
						onblur={() => commitRename(node.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter') commitRename(node.id);
							if (e.key === 'Escape') { renamingFolderId = null; }
						}}
						class="flex-1 bg-surface-hover border border-accent rounded px-1.5 py-0.5 text-sm text-text outline-none"
					/>
				</div>
			{:else}
				<a
					href={getMailboxHref(node)}
					class="flex-1 flex items-center gap-2 pr-1 py-1.5 rounded-lg text-sm transition-colors
						{isMailboxActive(node)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html folderIcon}</span>
					<span class="flex-1 truncate">{node.name}</span>
					{#if node.unreadEmails > 0}
						<span class="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{node.unreadEmails}</span>
					{/if}
				</a>
				<div class="hidden group-hover:flex items-center gap-0.5 pr-1">
					<button
						onclick={() => startRename(node)}
						title="Rename folder"
						class="text-text-tertiary hover:text-text p-1 rounded cursor-pointer"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
					</button>
					<button
						onclick={() => deleteFolder(node)}
						title="Delete folder"
						class="text-text-tertiary hover:text-red-400 p-1 rounded cursor-pointer"
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
					</button>
				</div>
			{/if}
		</div>
		{#if node.children.length > 0 && isExpanded(node.id)}
			<div transition:slide={{ duration: 150 }}>
				{@render folderTree(node.children, depth + 1)}
			</div>
		{/if}
	{/each}
{/snippet}

<style>
	.chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: transform 150ms ease;
	}
	.chevron.expanded {
		transform: rotate(90deg);
	}
</style>
