<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { mailboxIconName } from '$lib/icons';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import {
		createFolderExpandedStore,
		isExpandedDefault,
		SECTION_FOLDERS,
		SECTION_LABELS
	} from '$lib/stores/folderExpanded';
	import type { Mailbox } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { findLabelsParentId, isLabelMailbox, isLabelsParent } from '$lib/types/labels';
	import { userState } from '$lib/stores/userState';
	import { REMIND_ME_LATER_NAME, isScheduledMailbox } from '$lib/jmap/mailbox';

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
		inbox: 0,
		'remind-me-later': 1,
		drafts: 2,
		scheduled: 2.5,
		sent: 3,
		archive: 4,
		junk: 5,
		trash: 6
	};

	/**
	 * The "Remind Me Later" mailbox is a plain user-named mailbox in JMAP
	 * (no role), so we tag it client-side as a pseudo-system folder so it
	 * sorts next to Inbox and gets its own icon.
	 */
	function pseudoRole(m: Mailbox): string | null {
		if (isScheduledMailbox(m)) return 'scheduled';
		if (m.role) return m.role;
		if (m.name === REMIND_ME_LATER_NAME && m.parentId === null) return 'remind-me-later';
		return null;
	}

	const systemFolders = $derived(
		mailboxes
			.filter((m) => pseudoRole(m) !== null && m.name !== 'Sent Messages')
			.sort((a, b) => {
				const ao = systemOrder[pseudoRole(a) ?? ''] ?? 10;
				const bo = systemOrder[pseudoRole(b) ?? ''] ?? 10;
				if (ao !== bo) return ao - bo;
				return a.sortOrder - b.sortOrder;
			})
	);

	const labelsParentId = $derived(findLabelsParentId(mailboxes));

	const userFolders = $derived(
		mailboxes.filter(
			(m) =>
				m.role === null &&
				!isLabelMailbox(m, labelsParentId) &&
				!isLabelsParent(m, labelsParentId) &&
				!(m.name === REMIND_ME_LATER_NAME && m.parentId === null) &&
				!isScheduledMailbox(m)
		)
	);

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
		// A message open full-page keeps its folder highlighted, so you can
		// still see where you are and where Back goes.
		if (page.url.pathname.startsWith('/email/') && page.data.email?.mailboxIds?.[m.id]) return true;
		if (m.role === 'inbox') return page.url.pathname.startsWith('/inbox');
		return page.url.pathname === `/folder/${m.id}`;
	}

	// Flagged is a virtual view (a keyword query, not a mailbox), so it gets
	// its own entry instead of riding the mailbox list.
	const flaggedActive = $derived(page.url.pathname.startsWith('/flagged'));

	function isLabelActive(label: Label): boolean {
		return page.url.pathname === `/folder/${label.id}`;
	}

	// Active-label lookup so we can show unread badges on labels. Each label
	// id *is* a mailbox id, so we join to the mailbox list.
	function getLabelUnread(id: string): number {
		const m = mailboxes.find((mb) => mb.id === id);
		return m?.unreadEmails ?? 0;
	}

	// --- Drag-to-move drop targets ---

	const EMAIL_DRAG_TYPE = 'application/x-email-ids';
	let dragOverId = $state<string | null>(null);

	function canDropOn(m: Mailbox): boolean {
		if (m.role === 'drafts' || m.role === 'sent') return false;
		if (m.name === 'Sent Messages') return false;
		// Only Send later puts mail in Scheduled.
		if (isScheduledMailbox(m)) return false;
		return true;
	}

	function hasEmailPayload(e: DragEvent): boolean {
		return !!e.dataTransfer?.types?.includes(EMAIL_DRAG_TYPE);
	}

	function onRowDragOver(e: DragEvent) {
		if (!hasEmailPayload(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	function onRowDragEnter(e: DragEvent, id: string) {
		if (!hasEmailPayload(e)) return;
		dragOverId = id;
	}

	function onRowDragLeave(e: DragEvent, id: string) {
		// Only clear if we're actually leaving this row — ignore transitions
		// between children of the row.
		const related = e.relatedTarget as Node | null;
		const current = e.currentTarget as Node;
		if (related && current.contains(related)) return;
		if (dragOverId === id) dragOverId = null;
	}

	async function onRowDrop(e: DragEvent, targetMailboxId: string, targetIsLabel: boolean) {
		if (!hasEmailPayload(e)) return;
		e.preventDefault();
		dragOverId = null;

		const raw = e.dataTransfer?.getData(EMAIL_DRAG_TYPE);
		if (!raw) return;
		let ids: unknown;
		try { ids = JSON.parse(raw); } catch { return; }
		if (!Array.isArray(ids) || ids.length === 0) return;

		// Dropping on a label should ADD the label (multi-mailbox membership)
		// without removing the email from its home folder — so omit
		// sourceMailboxId. For real folders, include the current list's
		// mailbox so the move actually moves.
		const body: Record<string, unknown> = {
			ids,
			action: 'moveTo',
			targetMailboxId
		};
		if (!targetIsLabel && currentMailboxId) {
			body.sourceMailboxId = currentMailboxId;
		}

		await fetch('/api/email/bulk', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		await invalidateAll();
	}

	/** The mailbox the user is currently viewing, so folder drops can
	 *  detach from it. Derived from the URL. */
	const currentMailboxId = $derived.by(() => {
		const path = page.url.pathname;
		const m = path.match(/^\/folder\/([^/]+)/);
		if (m) return m[1];
		if (path.startsWith('/inbox')) {
			return systemFolders.find((f) => f.role === 'inbox')?.id ?? '';
		}
		return '';
	});
</script>

<aside class="w-full h-full bg-surface flex flex-col overflow-hidden">
	{#if !hideHeader && !collapsed}
		<div class="px-4 py-3">
			<h1 class="text-lg font-bold text-text tracking-tight leading-none">ameera.</h1>
		</div>
	{/if}

	<!-- Compose lives in the bottom-right corner, beside Raven. -->
	<div class="h-1.5 shrink-0" aria-hidden="true"></div>

	{#if collapsed}
		<!-- Collapsed: flat icon list, tooltips only -->
		<nav class="flex-1 overflow-y-auto py-1 px-1.5 flex flex-col gap-0.5">
			{#each systemFolders as mailbox (mailbox.id)}
				<a
					href={getMailboxHref(mailbox)}
					title={mailbox.name}
					class="flex items-center justify-center py-2 rounded-lg transition-colors
						{isMailboxActive(mailbox)
							? 'bg-accent/10 text-accent-fg'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current"><Icon name={mailboxIconName(pseudoRole(mailbox))} /></span>
				</a>
				{#if pseudoRole(mailbox) === 'inbox'}
					<a
						href="/flagged"
						title="Starred"
						class="flex items-center justify-center py-2 rounded-lg transition-colors
							{flaggedActive
								? 'bg-accent/10 text-accent-fg'
								: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
					>
						<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current"><Icon name="star" /></span>
					</a>
				{/if}
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
							? 'bg-accent/10 text-accent-fg'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current"><Icon name="folder" /></span>
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
				{@const droppable = canDropOn(mailbox)}
				<a
					href={getMailboxHref(mailbox)}
					ondragover={droppable ? onRowDragOver : undefined}
					ondragenter={droppable ? (e) => onRowDragEnter(e, mailbox.id) : undefined}
					ondragleave={droppable ? (e) => onRowDragLeave(e, mailbox.id) : undefined}
					ondrop={droppable ? (e) => onRowDrop(e, mailbox.id, false) : undefined}
					class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
						{dragOverId === mailbox.id
							? 'bg-accent/20 text-accent-fg ring-1 ring-accent/40'
							: isMailboxActive(mailbox)
								? 'bg-accent/10 text-accent-fg'
								: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current"><Icon name={mailboxIconName(pseudoRole(mailbox))} /></span>
					<span class="flex-1 truncate">{mailbox.name}</span>
					{#if mailbox.unreadEmails > 0}
						<span class="text-xs font-medium bg-accent/15 text-accent-fg px-1.5 py-0.5 rounded-full">{mailbox.unreadEmails}</span>
					{/if}
				</a>
				{#if pseudoRole(mailbox) === 'inbox'}
					<a
						href="/flagged"
						class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
							{flaggedActive
								? 'bg-accent/10 text-accent-fg'
								: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
					>
						<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current"><Icon name="star" /></span>
						<span class="flex-1 truncate">Starred</span>
					</a>
				{/if}
			{/each}

			<!-- FOLDERS section -->
			<div class="mt-4 mb-1 pl-3 pr-1">
				<button
					onclick={() => expanded.toggle(SECTION_FOLDERS)}
					class="w-full flex items-center gap-1.5 py-1 text-3xs font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary cursor-pointer"
				>
					<span class="chevron {isExpanded(SECTION_FOLDERS) ? 'expanded' : ''}">
						<Icon name="expand" size={12} />
					</span>
					Folders
				</button>
			</div>

			{#if isExpanded(SECTION_FOLDERS)}
				<div transition:slide={{ duration: 150 }}>
					{#if userFolderTree.length === 0}
						<p class="text-2xs text-text-tertiary/70 px-3 py-2 italic">No folders yet</p>
					{:else}
						{@render folderTree(userFolderTree, 0)}
					{/if}
				</div>
			{/if}

			<!-- LABELS section -->
			<div class="mt-4 mb-1 pl-3 pr-1">
				<button
					onclick={() => expanded.toggle(SECTION_LABELS)}
					class="w-full flex items-center gap-1.5 py-1 text-3xs font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary cursor-pointer"
				>
					<span class="chevron {isExpanded(SECTION_LABELS) ? 'expanded' : ''}">
						<Icon name="expand" size={12} />
					</span>
					Labels
				</button>
			</div>

			{#if isExpanded(SECTION_LABELS)}
				<div transition:slide={{ duration: 150 }}>
					{#if labels.length === 0}
						<p class="text-2xs text-text-tertiary/70 px-3 py-2 italic">No labels yet</p>
					{:else}
						{#each labels as label (label.id)}
							<a
								href={`/folder/${label.id}`}
								ondragover={onRowDragOver}
								ondragenter={(e) => onRowDragEnter(e, label.id)}
								ondragleave={(e) => onRowDragLeave(e, label.id)}
								ondrop={(e) => onRowDrop(e, label.id, true)}
								class="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors
									{dragOverId === label.id
										? 'bg-accent/20 text-accent-fg ring-1 ring-accent/40'
										: isLabelActive(label)
											? 'bg-accent/10 text-accent-fg'
											: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
							>
								<span class="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style="background-color: {label.color}"></span>
								<span class="flex-1 truncate">{label.name}</span>
								{#if getLabelUnread(label.id) > 0}
									<span class="text-xs font-medium bg-accent/15 text-accent-fg px-1.5 py-0.5 rounded-full shrink-0">{getLabelUnread(label.id)}</span>
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
				<Icon name="expand-sidebar" size={16} />
			{:else}
				<Icon name="collapse-sidebar" size={16} />
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			ondragover={onRowDragOver}
			ondragenter={(e) => onRowDragEnter(e, node.id)}
			ondragleave={(e) => onRowDragLeave(e, node.id)}
			ondrop={(e) => onRowDrop(e, node.id, false)}
			class="relative flex items-center gap-2.5 pr-1 py-1.5 rounded-lg text-sm transition-colors
				{dragOverId === node.id
					? 'bg-accent/20 text-accent-fg ring-1 ring-accent/40'
					: isMailboxActive(node)
						? 'bg-accent/10 text-accent-fg'
						: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
			style="padding-left: {0.75 * (depth + 1)}rem"
		>
			<!--
				The expander sits in the row's own left padding rather than in the
				flow, which is what puts a top-level folder's icon at the same 12px
				as Inbox and Sent above it. Previously every folder reserved a 20px
				chevron slot in-flow — even leaves, which have no chevron — so the
				whole section sat indented from the system list for no reason a
				reader could see. Nested levels still step in one unit each, and the
				chevron follows them.

				The unit is 0.75rem rather than 12px because the system rows use
				Tailwind's px-3 and layout.css scales every rem by a 107.5% root
				font-size; a hardcoded 12px drifts out of alignment as soon as
				that knob moves.
			-->
			{#if node.children.length > 0}
				<button
					onclick={() => expanded.toggle(node.id)}
					title={isExpanded(node.id) ? 'Collapse' : 'Expand'}
					class="absolute top-1/2 -translate-y-1/2 w-3 h-5 flex items-center justify-center text-current opacity-70 hover:opacity-100 cursor-pointer"
					style="left: {depth * 0.75}rem"
				>
					<span class="chevron {isExpanded(node.id) ? 'expanded' : ''}">
						<Icon name="expand" size={12} />
					</span>
				</button>
			{/if}

			<a
				href={getMailboxHref(node)}
				class="flex-1 min-w-0 flex items-center gap-2 text-inherit no-underline"
			>
				<span
					class="w-4 h-4 shrink-0 flex items-center justify-center"
					style={$userState.folders.get(node.id)?.color
						? `color: ${$userState.folders.get(node.id)?.color}`
						: ''}
				><Icon name="folder" /></span>
				<span class="flex-1 truncate">{node.name}</span>
				{#if node.unreadEmails > 0}
					<span class="text-xs font-medium bg-accent/15 text-accent-fg px-1.5 py-0.5 rounded-full shrink-0">{node.unreadEmails}</span>
				{/if}
			</a>
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
