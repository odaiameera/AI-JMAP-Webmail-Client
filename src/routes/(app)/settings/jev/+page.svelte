<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { invalidateAll } from '$app/navigation';
	import SettingRow, { type SaveState } from '$lib/components/settings/SettingRow.svelte';
	import Toggle from '$lib/components/settings/Toggle.svelte';
	import { INBOX_CATEGORIES } from '$lib/types/categories';
	import { categoryIcon } from '$lib/components/category-icons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Switch positions not yet confirmed by a reload, keyed by account id —
	// so a toggle moves at once, and falls back to the loaded value on error.
	const pending = $state<Record<string, boolean>>({});

	const states = $state<Record<string, SaveState>>({});

	async function setInboxTabs(accountId: string, on: boolean) {
		pending[accountId] = on;
		states[accountId] = 'saving';
		try {
			const res = await fetch('/api/jev/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId, inboxTabs: on })
			});
			if (!res.ok) throw new Error();
			states[accountId] = 'saved';
			setTimeout(() => { if (states[accountId] === 'saved') states[accountId] = 'idle'; }, 1800);
			await invalidateAll();
		} catch {
			states[accountId] = 'error';
		}
		delete pending[accountId];
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Jev', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Jev</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Sorting your Inbox into tabs. Jev, TypeSafe's decision model, will do the sorting for accounts
		you switch on; until then you sort mail yourself.
	</p>
</header>

<section class="mb-8">
	<h2 class="text-sm font-semibold text-text mb-1">Inbox tabs</h2>
	<p class="text-xs text-text-tertiary mb-3">
		Splits the Inbox into four tabs. Messages stay in the Inbox — a tab only decides where you see
		them — and anything not sorted into one of the other three stays in Important.
	</p>

	<ul class="grid grid-cols-2 gap-2 mb-4">
		{#each INBOX_CATEGORIES as c (c.key)}
			<li class="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-hover/50 border border-border/60">
				<span class="mt-0.5 shrink-0 text-text-secondary">{@html categoryIcon(c.key, 14)}</span>
				<span class="min-w-0">
					<span class="block text-sm text-text">{c.label}</span>
					<span class="block text-xs text-text-tertiary">{c.description}</span>
				</span>
			</li>
		{/each}
	</ul>

	{#each data.jevAccounts as account (account.id)}
		<SettingRow
			title={account.displayName ? `${account.displayName} · ${account.email}` : account.email}
			description={account.isActive
				? 'Show tabs in this account’s Inbox. This is the account you’re using now.'
				: 'Show tabs in this account’s Inbox.'}
			state={states[account.id] ?? 'idle'}
			errorMessage="Couldn’t save. Try again."
		>
			{#snippet control()}
				<Toggle
					checked={pending[account.id] ?? account.inboxTabs}
					onChange={(v) => setInboxTabs(account.id, v)}
				/>
			{/snippet}
		</SettingRow>
	{/each}
</section>

<div class="rounded-xl border border-border bg-surface-hover/40 p-4">
	<p class="text-sm font-medium text-text">Sorting by hand, for now</p>
	<p class="text-xs text-text-tertiary mt-1">
		Drag a message onto a tab, or use <span class="text-text-secondary">Move to tab</span> on a
		message or a selection. Jev doesn’t read any mail yet. When it does, it will read only the
		accounts you allow here, and this page will say exactly what it sends to TypeSafe.
	</p>
</div>
