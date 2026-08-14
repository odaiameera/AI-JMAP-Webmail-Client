<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { parseSearch, type Token } from '$lib/search/parse';
	import { findLabelsParentId, isLabelMailbox, isLabelsParent } from '$lib/types/labels';
	import type { Mailbox } from '$lib/jmap/types';

	let { mailboxes }: { mailboxes: Mailbox[] } = $props();

	const raw = $derived(page.url.searchParams.get('q') ?? '');
	const tokens = $derived(parseSearch(raw));

	const isUnreadActive = $derived(
		tokens.some((t) => t.kind === 'flag' && t.op === 'is' && t.value === 'unread')
	);
	const isStarredActive = $derived(
		tokens.some((t) => t.kind === 'flag' && t.op === 'is' && t.value === 'starred')
	);
	const hasAttachmentActive = $derived(
		tokens.some((t) => t.kind === 'flag' && t.op === 'has' && t.value === 'attachment')
	);
	const activeAfterToken = $derived(
		tokens.find((t) => t.kind === 'field' && t.field === 'after')
	);
	const todayIso = $derived(new Date().toISOString().slice(0, 10));
	const todayActive = $derived(
		activeAfterToken?.kind === 'field' && activeAfterToken.value === todayIso
	);
	const activeInToken = $derived(
		tokens.find((t) => (t.kind === 'field' && t.field === 'in') || (t.kind === 'field' && t.field === 'label'))
	);

	function applyRaw(nextRaw: string) {
		const trimmed = nextRaw.trim();
		if (!trimmed) {
			// Clearing the last chip returns to the inbox rather than leaving
			// the user on an empty /search page.
			goto('/inbox');
			return;
		}
		goto(`/search?q=${encodeURIComponent(trimmed)}`, { keepFocus: true });
	}

	/**
	 * Remove every token that `matchFn` returns true for, preserving the
	 * surrounding raw whitespace. Falls through to `raw` unchanged if
	 * nothing matches.
	 */
	function stripTokens(matchFn: (t: Token) => boolean): string {
		const hits = tokens.filter(matchFn);
		if (hits.length === 0) return raw;
		// Walk right-to-left so earlier `start/end` offsets stay valid.
		let out = raw;
		for (let i = hits.length - 1; i >= 0; i--) {
			const h = hits[i]!;
			out = out.slice(0, h.start) + out.slice(h.end);
		}
		return out.replace(/\s{2,}/g, ' ').trim();
	}

	function appendToken(fragment: string): string {
		return raw.trim() ? `${raw.trim()} ${fragment}` : fragment;
	}

	function toggleFlag(op: 'is' | 'has', value: string) {
		const active = tokens.some((t) => t.kind === 'flag' && t.op === op && t.value === value);
		if (active) {
			applyRaw(stripTokens((t) => t.kind === 'flag' && t.op === op && t.value === value));
		} else {
			applyRaw(appendToken(`${op}:${value}`));
		}
	}

	function toggleToday() {
		if (todayActive) {
			applyRaw(stripTokens((t) => t.kind === 'field' && t.field === 'after' && t.value === todayIso));
		} else {
			// Replace any existing after: so they don't stack.
			const cleared = stripTokens((t) => t.kind === 'field' && t.field === 'after');
			applyRaw((cleared.trim() ? `${cleared.trim()} ` : '') + `after:${todayIso}`);
		}
	}

	let folderDropdownOpen = $state(false);
	let folderDropdownEl = $state<HTMLDivElement | undefined>(undefined);

	type FolderOption = { kind: 'role' | 'folder' | 'label'; label: string; token: string; id: string };

	const folderOptions = $derived.by<FolderOption[]>(() => {
		const byRole = new Map(mailboxes.filter((m) => m.role).map((m) => [m.role as string, m]));
		const roleOrder: [string, string][] = [
			['inbox', 'Inbox'],
			['sent', 'Sent'],
			['drafts', 'Drafts'],
			['archive', 'Archive'],
			['junk', 'Junk'],
			['trash', 'Trash']
		];
		const roles: FolderOption[] = roleOrder
			.filter(([r]) => byRole.has(r))
			.map(([r, label]) => ({ kind: 'role', label, token: `in:${r}`, id: byRole.get(r)!.id }));

		const labelsParentId = findLabelsParentId(mailboxes);

		const userFolders: FolderOption[] = mailboxes
			.filter((m) => !m.role && !isLabelMailbox(m, labelsParentId) && !isLabelsParent(m, labelsParentId))
			.map((m) => ({ kind: 'folder' as const, label: m.name, token: `in:${quoteIfNeeded(m.name)}`, id: m.id }))
			.sort((a, b) => a.label.localeCompare(b.label));

		const labels: FolderOption[] = mailboxes
			.filter((m) => isLabelMailbox(m, labelsParentId))
			.map((m) => ({ kind: 'label' as const, label: m.name, token: `label:${quoteIfNeeded(m.name)}`, id: m.id }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return [...roles, ...userFolders, ...labels];
	});

	function quoteIfNeeded(s: string): string {
		return /\s/.test(s) ? `"${s}"` : s;
	}

	function activeFolderLabel(): string | null {
		if (!activeInToken || activeInToken.kind !== 'field') return null;
		const opt = folderOptions.find((o) => {
			if (activeInToken.field === 'in') {
				return o.token === `in:${activeInToken.value}` || o.token === `in:${quoteIfNeeded(activeInToken.value)}`;
			}
			if (activeInToken.field === 'label') {
				return o.token === `label:${activeInToken.value}` || o.token === `label:${quoteIfNeeded(activeInToken.value)}`;
			}
			return false;
		});
		return opt?.label ?? activeInToken.value;
	}

	function pickFolder(opt: FolderOption) {
		folderDropdownOpen = false;
		const cleared = stripTokens(
			(t) => t.kind === 'field' && (t.field === 'in' || t.field === 'label')
		);
		applyRaw((cleared.trim() ? `${cleared.trim()} ` : '') + opt.token);
	}

	function clearFolder() {
		folderDropdownOpen = false;
		applyRaw(stripTokens((t) => t.kind === 'field' && (t.field === 'in' || t.field === 'label')));
	}

	function handleClickOutside(e: MouseEvent) {
		if (folderDropdownOpen && folderDropdownEl && !folderDropdownEl.contains(e.target as Node)) {
			folderDropdownOpen = false;
		}
	}

	const activeBase =
		'inline-flex items-center gap-1 pl-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border';
	const activeOn = 'bg-accent/15 text-accent border-accent/40';
	const activeOff = 'bg-transparent text-text-tertiary border-border hover:text-text-secondary hover:border-text-tertiary';
</script>

{#snippet closeIcon()}
	<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
		<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
	</svg>
{/snippet}

<svelte:window onclick={handleClickOutside} />

<div class="flex items-center gap-1.5 flex-wrap">
	<button
		type="button"
		onclick={() => toggleFlag('is', 'unread')}
		class="{activeBase} {isUnreadActive ? activeOn : activeOff} {isUnreadActive ? 'pr-1' : 'pr-2.5'}"
	>
		<span>Unread</span>
		{#if isUnreadActive}
			<span class="p-0.5 rounded-full hover:bg-accent/25" aria-label="Clear Unread">{@render closeIcon()}</span>
		{/if}
	</button>
	<button
		type="button"
		onclick={() => toggleFlag('is', 'starred')}
		class="{activeBase} {isStarredActive ? activeOn : activeOff} {isStarredActive ? 'pr-1' : 'pr-2.5'}"
	>
		<span>Starred</span>
		{#if isStarredActive}
			<span class="p-0.5 rounded-full hover:bg-accent/25" aria-label="Clear Starred">{@render closeIcon()}</span>
		{/if}
	</button>
	<button
		type="button"
		onclick={() => toggleFlag('has', 'attachment')}
		class="{activeBase} {hasAttachmentActive ? activeOn : activeOff} {hasAttachmentActive ? 'pr-1' : 'pr-2.5'}"
	>
		<span>Has attachment</span>
		{#if hasAttachmentActive}
			<span class="p-0.5 rounded-full hover:bg-accent/25" aria-label="Clear Has attachment">{@render closeIcon()}</span>
		{/if}
	</button>
	<button
		type="button"
		onclick={toggleToday}
		class="{activeBase} {todayActive ? activeOn : activeOff} {todayActive ? 'pr-1' : 'pr-2.5'}"
	>
		<span>Today</span>
		{#if todayActive}
			<span class="p-0.5 rounded-full hover:bg-accent/25" aria-label="Clear Today">{@render closeIcon()}</span>
		{/if}
	</button>

	<div class="relative" bind:this={folderDropdownEl}>
		<button
			type="button"
			onclick={() => (folderDropdownOpen = !folderDropdownOpen)}
			class="{activeBase} {activeInToken ? activeOn : activeOff} {activeInToken ? 'pr-1' : 'pr-2.5'}"
		>
			<span>{activeInToken ? `In: ${activeFolderLabel()}` : 'Folder'}</span>
			{#if activeInToken}
				<span
					onclick={(e) => { e.stopPropagation(); clearFolder(); }}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clearFolder(); } }}
					role="button"
					tabindex="0"
					class="p-0.5 rounded-full hover:bg-accent/25"
					aria-label="Clear folder filter"
				>
					{@render closeIcon()}
				</span>
			{:else}
				<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
			{/if}
		</button>
		{#if folderDropdownOpen}
			<div class="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto bg-surface border border-border rounded-lg shadow-xl z-40 py-1">
				{#if activeInToken}
					<button
						type="button"
						onclick={clearFolder}
						class="w-full text-left px-3 py-1.5 text-xs text-text-tertiary hover:bg-surface-hover cursor-pointer"
					>
						Clear folder filter
					</button>
					<div class="border-t border-border my-1"></div>
				{/if}
				{#each folderOptions as opt, i}
					{@const prev = folderOptions[i - 1]}
					{#if prev && prev.kind !== opt.kind}
						<div class="border-t border-border my-1"></div>
					{/if}
					<button
						type="button"
						onclick={() => pickFolder(opt)}
						class="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text cursor-pointer flex items-center gap-2"
					>
						<span class="text-[10px] uppercase tracking-wider text-text-tertiary w-10 shrink-0">
							{opt.kind === 'role' ? 'Folder' : opt.kind === 'label' ? 'Label' : 'Folder'}
						</span>
						<span class="truncate">{opt.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
