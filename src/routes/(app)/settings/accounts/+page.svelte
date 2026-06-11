<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { pageTitle } from '$lib/utils/title';
	import ColorGrid from '$lib/components/modals/ColorGrid.svelte';
	import { colorByHex, DEFAULT_LABEL_COLOR } from '$lib/constants/colors';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	const accounts = $derived(data.accounts ?? []);
	const activeAccountId = $derived(data.activeAccountId);

	// --- Add account form ---
	let adding = $state(false);
	let addEmail = $state('');
	let addPassword = $state('');
	let addColor = $state(DEFAULT_LABEL_COLOR);
	let addServerUrl = $state('');
	let showServerUrl = $state(false);
	let addBusy = $state(false);
	let addError = $state<string | null>(null);

	// --- Per-row state ---
	let confirmRemoveId = $state<string | null>(null);
	let colorPickerId = $state<string | null>(null);
	let rowBusy = $state(false);

	async function addAccount() {
		if (!addEmail || !addPassword || addBusy) return;
		addBusy = true;
		addError = null;
		try {
			const res = await fetch('/api/accounts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: addEmail,
					password: addPassword,
					color: addColor.hex,
					...(addServerUrl.trim() ? { serverUrl: addServerUrl.trim() } : {})
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				addError = body?.message ?? 'Could not link the account';
				return;
			}
			adding = false;
			addEmail = '';
			addPassword = '';
			addServerUrl = '';
			addColor = DEFAULT_LABEL_COLOR;
			await invalidateAll();
		} catch {
			addError = 'Could not reach the server';
		} finally {
			addBusy = false;
		}
	}

	async function removeAccount(id: string) {
		if (rowBusy) return;
		rowBusy = true;
		try {
			const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
			if (res.ok) {
				confirmRemoveId = null;
				await invalidateAll();
			}
		} finally {
			rowBusy = false;
		}
	}

	async function setColor(id: string, hex: string) {
		colorPickerId = null;
		await fetch(`/api/accounts/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ color: hex })
		});
		await invalidateAll();
	}

	async function makeActive(id: string) {
		const res = await fetch('/api/accounts/switch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (res.ok) await invalidateAll();
	}

	async function move(id: string, dir: -1 | 1) {
		const ids = accounts.map((a) => a.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		const res = await fetch('/api/accounts/reorder', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});
		if (res.ok) await invalidateAll();
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Accounts', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6 flex items-start justify-between gap-4">
	<div>
		<h1 class="text-xl font-semibold text-text">Accounts</h1>
		<p class="text-sm text-text-tertiary mt-1">
			Mail accounts linked to this webmail. Each account keeps its own labels, rules, signatures,
			reminders, and calendar.
		</p>
	</div>
	<button
		type="button"
		onclick={() => { adding = !adding; addError = null; }}
		class="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors cursor-pointer"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		Add account
	</button>
</header>

{#if adding}
	<section class="mb-6 border border-border rounded-xl p-4 bg-surface">
		<h2 class="text-sm font-medium text-text mb-3">Link a mail account</h2>
		{#if addError}
			<div class="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-3 py-2 mb-3">
				{addError}
			</div>
		{/if}
		<div class="space-y-3">
			<div class="flex gap-3">
				<input
					bind:value={addEmail}
					type="email"
					placeholder="you@yourdomain.com"
					autocomplete="off"
					class="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors"
				/>
				<input
					bind:value={addPassword}
					type="password"
					placeholder="Mail account password"
					autocomplete="new-password"
					class="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors"
				/>
			</div>
			{#if showServerUrl}
				<input
					bind:value={addServerUrl}
					type="url"
					placeholder="https://mail.example.com (defaults to your configured server)"
					class="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors"
				/>
			{:else}
				<button type="button" onclick={() => (showServerUrl = true)}
					class="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer">
					Different mail server?
				</button>
			{/if}
			<div>
				<p class="text-xs text-text-tertiary mb-2">Account color — shown in the header and switcher so you always know which inbox is open.</p>
				<ColorGrid value={addColor} onChange={(c) => (addColor = c)} />
			</div>
			<div class="flex items-center justify-end gap-2 pt-1">
				<button type="button" onclick={() => (adding = false)}
					class="px-3.5 py-2 text-sm text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
					Cancel
				</button>
				<button
					type="button"
					onclick={addAccount}
					disabled={addBusy || !addEmail || !addPassword}
					class="px-3.5 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
				>
					{addBusy ? 'Verifying…' : 'Link account'}
				</button>
			</div>
		</div>
	</section>
{/if}

<section>
	{#each accounts as account, i (account.id)}
		<div class="flex items-center gap-3 py-3.5 border-b border-border last:border-b-0">
			<!-- Color dot / picker -->
			<div class="relative">
				<button
					type="button"
					title="Change color"
					onclick={() => (colorPickerId = colorPickerId === account.id ? null : account.id)}
					class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:scale-105 transition-transform"
					style="background-color: {account.color}"
				>
					{account.email[0]?.toUpperCase()}
				</button>
				{#if colorPickerId === account.id}
					<div class="absolute z-20 top-10 left-0 bg-surface border border-border rounded-xl shadow-lg p-3">
						<ColorGrid value={colorByHex(account.color)} onChange={(c) => setColor(account.id, c.hex)} />
					</div>
				{/if}
			</div>

			<div class="flex-1 min-w-0">
				<p class="text-sm text-text truncate">
					{account.email}
					{#if account.id === activeAccountId}
						<span class="ml-2 text-[10px] uppercase tracking-wide text-accent font-semibold">Active</span>
					{/if}
					{#if i === 0}
						<span class="ml-2 text-[10px] uppercase tracking-wide text-text-tertiary" title="Signed in by default">Default</span>
					{/if}
				</p>
				{#if account.needsReauth}
					<p class="text-xs text-danger mt-0.5">Reconnect required — the mail server rejected the stored password.</p>
				{/if}
			</div>

			<!-- Reorder -->
			<div class="flex flex-col">
				<button type="button" aria-label="Move up" disabled={i === 0} onclick={() => move(account.id, -1)}
					class="text-text-tertiary hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
				</button>
				<button type="button" aria-label="Move down" disabled={i === accounts.length - 1} onclick={() => move(account.id, 1)}
					class="text-text-tertiary hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
				</button>
			</div>

			{#if account.id !== activeAccountId}
				<button type="button" onclick={() => makeActive(account.id)}
					class="px-3 py-1.5 text-xs text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
					Switch to
				</button>
			{/if}

			{#if confirmRemoveId === account.id}
				<span class="text-xs text-text-secondary">Remove?</span>
				<button type="button" disabled={rowBusy} onclick={() => removeAccount(account.id)}
					class="px-2.5 py-1.5 text-xs text-white bg-danger hover:opacity-90 rounded-lg transition-opacity cursor-pointer">
					Yes
				</button>
				<button type="button" onclick={() => (confirmRemoveId = null)}
					class="px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
					No
				</button>
			{:else}
				<button type="button" title="Remove account" aria-label="Remove account"
					onclick={() => (confirmRemoveId = account.id)}
					disabled={accounts.length === 1}
					class="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-default transition-colors cursor-pointer p-1.5">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
					</svg>
				</button>
			{/if}
		</div>
	{/each}
</section>

<div class="mt-4 text-xs text-text-tertiary">
	Removing an account only unlinks it from the webmail — nothing is deleted on the mail server, and
	its labels, rules, and other data here are restored if you link it again.
</div>
