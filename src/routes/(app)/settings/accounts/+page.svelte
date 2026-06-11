<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { pageTitle } from '$lib/utils/title';
	import ColorGrid from '$lib/components/modals/ColorGrid.svelte';
	import { colorByHex, DEFAULT_LABEL_COLOR } from '$lib/constants/colors';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	const accounts = $derived(data.accounts ?? []);
	const activeAccountId = $derived(data.activeAccountId);

	// --- Add account modal ---
	let adding = $state(false);
	let addEmail = $state('');
	let addPassword = $state('');
	let addColor = $state(DEFAULT_LABEL_COLOR);
	let addServerUrl = $state('');
	let showServerUrl = $state(false);
	let addBusy = $state(false);
	let addError = $state<string | null>(null);
	let addEmailEl = $state<HTMLInputElement | null>(null);

	const addColorName = $derived(colorByHex(addColor.hex).name);

	// --- Per-row state ---
	let confirmRemoveId = $state<string | null>(null);
	let colorPickerId = $state<string | null>(null);
	let rowBusy = $state(false);

	function openAdd() {
		addEmail = '';
		addPassword = '';
		addServerUrl = '';
		addColor = DEFAULT_LABEL_COLOR;
		showServerUrl = false;
		addError = null;
		adding = true;
		setTimeout(() => addEmailEl?.focus(), 0);
	}

	function closeAdd() {
		if (addBusy) return;
		adding = false;
	}

	function handleModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeAdd();
		} else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'INPUT') {
			e.preventDefault();
			addAccount();
		}
	}

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
		onclick={openAdd}
		class="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors cursor-pointer"
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		Add account
	</button>
</header>

<section class="border border-border rounded-xl bg-surface overflow-visible">
	{#each accounts as account, i (account.id)}
		{@const isActive = account.id === activeAccountId}
		<div class="group relative flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0">
			<!-- Avatar / color picker -->
			<div class="relative shrink-0">
				<button
					type="button"
					title="Change color"
					onclick={() => (colorPickerId = colorPickerId === account.id ? null : account.id)}
					class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold cursor-pointer transition-shadow hover:ring-2 hover:ring-offset-2 hover:ring-offset-surface"
					class:ring-2={isActive}
					class:ring-offset-2={isActive}
					class:ring-offset-surface={isActive}
					style="background-color: {account.color}; --tw-ring-color: {account.color};"
				>
					{account.email[0]?.toUpperCase()}
				</button>
				{#if colorPickerId === account.id}
					<button
						type="button"
						class="fixed inset-0 z-20 cursor-default"
						aria-label="Close color picker"
						onclick={() => (colorPickerId = null)}
					></button>
					<div class="absolute z-30 top-11 left-0 w-max rounded-xl border border-border bg-surface p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
						<p class="text-xs font-medium text-text-secondary mb-2.5">Account color</p>
						<ColorGrid value={colorByHex(account.color)} onChange={(c) => setColor(account.id, c.hex)} />
					</div>
				{/if}
			</div>

			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2 min-w-0">
					<p class="text-sm font-medium text-text truncate">{account.email}</p>
					{#if isActive}
						<span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-accent/15 text-accent">Active</span>
					{/if}
					{#if i === 0}
						<span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-surface-hover text-text-tertiary" title="Opens by default when you sign in">Default</span>
					{/if}
				</div>
				{#if account.needsReauth}
					<p class="text-xs text-danger mt-0.5">Reconnect required — the mail server rejected the stored password.</p>
				{/if}
			</div>

			<!-- Row actions: quiet until the row is hovered -->
			<div
				class="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
				class:opacity-100={confirmRemoveId === account.id || colorPickerId === account.id}
			>
				<div class="flex flex-col mr-1">
					<button type="button" aria-label="Move up" disabled={i === 0} onclick={() => move(account.id, -1)}
						class="text-text-tertiary hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default p-0.5">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
					</button>
					<button type="button" aria-label="Move down" disabled={i === accounts.length - 1} onclick={() => move(account.id, 1)}
						class="text-text-tertiary hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default p-0.5">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
					</button>
				</div>

				{#if confirmRemoveId === account.id}
					<span class="text-xs text-text-secondary mr-1">Unlink this account?</span>
					<button type="button" disabled={rowBusy} onclick={() => removeAccount(account.id)}
						class="px-2.5 py-1.5 text-xs font-medium text-white bg-danger hover:opacity-90 rounded-lg transition-opacity cursor-pointer">
						Unlink
					</button>
					<button type="button" onclick={() => (confirmRemoveId = null)}
						class="px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
						Cancel
					</button>
				{:else}
					<button type="button" title="Remove account" aria-label="Remove account"
						onclick={() => (confirmRemoveId = account.id)}
						disabled={accounts.length === 1}
						class="text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-default transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-surface-hover">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				{/if}
			</div>

			{#if !isActive}
				<button type="button" onclick={() => makeActive(account.id)}
					class="shrink-0 px-3 py-1.5 text-xs font-medium text-text-secondary border border-border hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
					Switch to
				</button>
			{/if}
		</div>
	{/each}
</section>

<p class="mt-4 text-xs text-text-tertiary leading-relaxed">
	Removing an account only unlinks it from the webmail — nothing is deleted on the mail server, and
	its labels, rules, and other data here are restored if you link it again.
</p>

{#if adding}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="link-account-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeAdd();
		}}
		onkeydown={handleModalKeydown}
	>
		<div
			class="bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
			role="document"
		>
			<div class="flex items-start justify-between mb-1">
				<h2 id="link-account-title" class="text-lg font-semibold text-text">Link a mail account</h2>
				<button
					type="button"
					class="text-text-tertiary hover:text-text transition-colors cursor-pointer"
					onclick={closeAdd}
					aria-label="Close"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<p class="text-sm text-text-secondary mb-5 leading-relaxed">
				Sign in with the account's mail server credentials. The webmail verifies them, then keeps
				them encrypted so rules and reminders keep running in the background.
			</p>

			<div class="space-y-5">
				<div>
					<label class="block text-sm font-medium text-text mb-2" for="link-email">Email address</label>
					<input
						id="link-email"
						bind:value={addEmail}
						bind:this={addEmailEl}
						type="email"
						placeholder="you@yourdomain.com"
						autocomplete="off"
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-text mb-2" for="link-password">Mail server password</label>
					<input
						id="link-password"
						bind:value={addPassword}
						type="password"
						placeholder="••••••••"
						autocomplete="new-password"
						class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
					/>
				</div>

				{#if showServerUrl}
					<div>
						<label class="block text-sm font-medium text-text mb-2" for="link-server">Mail server</label>
						<input
							id="link-server"
							bind:value={addServerUrl}
							type="url"
							placeholder="https://mail.example.com"
							class="w-full bg-surface-hover border border-border focus:border-accent rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none transition-colors"
						/>
						<p class="text-xs text-text-tertiary mt-1.5">Leave empty to use your configured server.</p>
					</div>
				{:else}
					<button type="button" onclick={() => (showServerUrl = true)}
						class="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer">
						Different mail server?
					</button>
				{/if}

				<div>
					<div class="flex items-baseline gap-2 mb-3">
						<span class="text-sm font-medium text-text">Color:</span>
						<span class="text-sm text-text-secondary">{addColorName}</span>
					</div>
					<ColorGrid value={addColor} onChange={(c) => (addColor = c)} />
					<p class="text-xs text-text-tertiary mt-3">
						Shown in the header and account switcher so you always know which inbox is open.
					</p>
				</div>

				{#if addError}
					<div class="text-sm text-danger" aria-live="polite">{addError}</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
				<button
					type="button"
					class="px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer disabled:opacity-60"
					onclick={closeAdd}
					disabled={addBusy}
				>
					Cancel
				</button>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
					onclick={addAccount}
					disabled={addBusy || !addEmail || !addPassword}
				>
					{#if addBusy}
						<span class="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
					{/if}
					{addBusy ? 'Verifying…' : 'Link account'}
				</button>
			</div>
		</div>
	</div>
{/if}
