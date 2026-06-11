<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/utils/title';
	import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';

	interface PasskeyInfo {
		id: string;
		name: string;
		createdAt: string;
		lastUsedAt: string | null;
	}
	interface SessionInfo {
		id: string;
		createdAt: string;
		lastSeenAt: string;
		userAgent: string | null;
		ip: string | null;
		current: boolean;
	}

	// --- Change password ---
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let pwBusy = $state(false);
	let pwError = $state<string | null>(null);
	let pwSaved = $state(false);

	// --- Passkeys ---
	let passkeys = $state<PasskeyInfo[]>([]);
	let passkeySupported = $state(false);
	let pkBusy = $state(false);
	let pkError = $state<string | null>(null);
	let renameId = $state<string | null>(null);
	let renameValue = $state('');

	// --- Sessions ---
	let sessions = $state<SessionInfo[]>([]);

	onMount(async () => {
		passkeySupported = browserSupportsWebAuthn();
		await Promise.all([loadPasskeys(), loadSessions()]);
	});

	async function loadPasskeys() {
		const res = await fetch('/api/auth/passkeys');
		if (res.ok) passkeys = (await res.json()).passkeys;
	}

	async function loadSessions() {
		const res = await fetch('/api/auth/sessions');
		if (res.ok) sessions = (await res.json()).sessions;
	}

	async function changePassword() {
		if (pwBusy) return;
		pwError = null;
		pwSaved = false;
		if (newPassword.length < 8) {
			pwError = 'New password must be at least 8 characters';
			return;
		}
		if (newPassword !== confirmPassword) {
			pwError = 'New passwords do not match';
			return;
		}
		pwBusy = true;
		try {
			const res = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ current: currentPassword, next: newPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				pwError = body?.message ?? 'Could not change password';
				return;
			}
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			pwSaved = true;
			// Other sessions were revoked server-side; refresh the list.
			await loadSessions();
		} finally {
			pwBusy = false;
		}
	}

	async function registerPasskey() {
		if (pkBusy) return;
		pkBusy = true;
		pkError = null;
		try {
			const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
			if (!optRes.ok) {
				pkError = 'Could not start passkey registration';
				return;
			}
			const options = await optRes.json();
			const response = await startRegistration({ optionsJSON: options });
			const name = defaultPasskeyName();
			const verifyRes = await fetch('/api/auth/passkey/register/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ response, name })
			});
			if (!verifyRes.ok) {
				pkError = 'Passkey could not be verified';
				return;
			}
			await loadPasskeys();
		} catch (err) {
			if ((err as Error)?.name !== 'NotAllowedError') {
				pkError = 'Passkey registration failed';
			}
		} finally {
			pkBusy = false;
		}
	}

	function defaultPasskeyName(): string {
		const ua = navigator.userAgent;
		if (/iPhone|iPad/.test(ua)) return 'iOS device';
		if (/Mac/.test(ua)) return 'Mac';
		if (/Android/.test(ua)) return 'Android device';
		if (/Windows/.test(ua)) return 'Windows device';
		return 'Passkey';
	}

	async function renamePasskey(id: string) {
		if (!renameValue.trim()) return;
		await fetch(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: renameValue.trim() })
		});
		renameId = null;
		await loadPasskeys();
	}

	async function deletePasskey(id: string) {
		await fetch(`/api/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
		await loadPasskeys();
	}

	async function revokeSession(id: string) {
		await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
		await loadSessions();
	}

	function describeDevice(ua: string | null): string {
		if (!ua) return 'Unknown device';
		const browser = /Firefox\//.test(ua) ? 'Firefox'
			: /Edg\//.test(ua) ? 'Edge'
			: /Chrome\//.test(ua) ? 'Chrome'
			: /Safari\//.test(ua) ? 'Safari'
			: 'Browser';
		const os = /iPhone|iPad/.test(ua) ? 'iOS'
			: /Mac/.test(ua) ? 'macOS'
			: /Android/.test(ua) ? 'Android'
			: /Windows/.test(ua) ? 'Windows'
			: /Linux/.test(ua) ? 'Linux'
			: '';
		return os ? `${browser} on ${os}` : browser;
	}

	function relativeTime(iso: string): string {
		const t = new Date(iso.includes('T') ? iso : iso + 'Z').getTime();
		const mins = Math.round((Date.now() - t) / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.round(hours / 24)}d ago`;
	}

	const inputClass =
		'w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text ' +
		'placeholder-text-tertiary outline-none focus:border-accent transition-colors';
</script>

<svelte:head><title>{pageTitle({ page: 'Security', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Security</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Your webmail sign-in — separate from your mail accounts' passwords.
	</p>
</header>

<!-- Master password -->
<section class="mb-8">
	<h2 class="text-sm font-medium text-text mb-3">Master password</h2>
	<div class="max-w-sm space-y-3">
		{#if pwError}
			<div class="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-3 py-2">{pwError}</div>
		{/if}
		{#if pwSaved}
			<div class="bg-accent/10 border border-accent/20 text-accent text-sm rounded-lg px-3 py-2">
				Password changed. Other devices have been signed out.
			</div>
		{/if}
		<input bind:value={currentPassword} type="password" placeholder="Current password" autocomplete="current-password" class={inputClass} />
		<input bind:value={newPassword} type="password" placeholder="New password (8+ characters)" autocomplete="new-password" class={inputClass} />
		<input bind:value={confirmPassword} type="password" placeholder="Confirm new password" autocomplete="new-password" class={inputClass} />
		<button
			type="button"
			onclick={changePassword}
			disabled={pwBusy || !currentPassword || !newPassword || !confirmPassword}
			class="px-3.5 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
		>
			{pwBusy ? 'Changing…' : 'Change password'}
		</button>
	</div>
</section>

<!-- Passkeys -->
<section class="mb-8">
	<div class="flex items-center justify-between mb-3">
		<div>
			<h2 class="text-sm font-medium text-text">Passkeys</h2>
			<p class="text-xs text-text-tertiary mt-0.5">Sign in with Touch ID, Face ID, or a security key — no password needed.</p>
		</div>
		{#if passkeySupported}
			<button
				type="button"
				onclick={registerPasskey}
				disabled={pkBusy}
				class="shrink-0 px-3.5 py-2 text-sm text-white bg-accent hover:bg-accent-hover disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
			>
				{pkBusy ? 'Waiting…' : 'Add passkey'}
			</button>
		{/if}
	</div>

	{#if pkError}
		<div class="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-3 py-2 mb-3">{pkError}</div>
	{/if}
	{#if !passkeySupported}
		<p class="text-xs text-text-tertiary">This browser doesn't support passkeys.</p>
	{:else if passkeys.length === 0}
		<p class="text-xs text-text-tertiary">No passkeys yet.</p>
	{:else}
		{#each passkeys as pk (pk.id)}
			<div class="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary shrink-0">
					<circle cx="7.5" cy="8.5" r="3.5"/><path d="M2 21v-2a5.5 5.5 0 0 1 5.5-5.5h.5"/><circle cx="17" cy="11" r="3"/><path d="M17 14v5l1.5 1.5L20 19l-1.2-1.2L20 16.5z"/>
				</svg>
				<div class="flex-1 min-w-0">
					{#if renameId === pk.id}
						<input
							bind:value={renameValue}
							onkeydown={(e) => { if (e.key === 'Enter') renamePasskey(pk.id); if (e.key === 'Escape') renameId = null; }}
							class="bg-surface-hover border border-border rounded-lg px-2 py-1 text-sm text-text outline-none focus:border-accent w-[200px]"
						/>
					{:else}
						<p class="text-sm text-text truncate">{pk.name}</p>
					{/if}
					<p class="text-xs text-text-tertiary mt-0.5">
						{pk.lastUsedAt ? `Last used ${relativeTime(pk.lastUsedAt)}` : 'Never used'}
					</p>
				</div>
				{#if renameId === pk.id}
					<button type="button" onclick={() => renamePasskey(pk.id)}
						class="px-2.5 py-1.5 text-xs text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors cursor-pointer">Save</button>
					<button type="button" onclick={() => (renameId = null)}
						class="px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">Cancel</button>
				{:else}
					<button type="button" onclick={() => { renameId = pk.id; renameValue = pk.name; }}
						class="px-2.5 py-1.5 text-xs text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">Rename</button>
					<button type="button" onclick={() => deletePasskey(pk.id)}
						class="px-2.5 py-1.5 text-xs text-text-tertiary hover:text-danger transition-colors cursor-pointer">Remove</button>
				{/if}
			</div>
		{/each}
	{/if}
</section>

<!-- Sessions -->
<section>
	<h2 class="text-sm font-medium text-text mb-1">Active sessions</h2>
	<p class="text-xs text-text-tertiary mb-3">Devices currently signed in to this webmail.</p>
	{#each sessions as s (s.id)}
		<div class="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
			<div class="flex-1 min-w-0">
				<p class="text-sm text-text truncate">
					{describeDevice(s.userAgent)}
					{#if s.current}
						<span class="ml-2 text-[10px] uppercase tracking-wide text-accent font-semibold">This device</span>
					{/if}
				</p>
				<p class="text-xs text-text-tertiary mt-0.5">
					Active {relativeTime(s.lastSeenAt)}{s.ip ? ` · ${s.ip}` : ''}
				</p>
			</div>
			{#if !s.current}
				<button type="button" onclick={() => revokeSession(s.id)}
					class="px-2.5 py-1.5 text-xs text-text-tertiary hover:text-danger transition-colors cursor-pointer">
					Sign out
				</button>
			{/if}
		</div>
	{/each}
</section>
