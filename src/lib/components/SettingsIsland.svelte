<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { onClose, initialTheme, displayName, signature }: {
		onClose: () => void;
		initialTheme: string;
		displayName: string;
		signature: string;
	} = $props();

	let activeCategory = $state<string>('appearance');
	let theme = $state(initialTheme);
	let localDisplayName = $state(displayName);
	let localSignature = $state(signature);
	let accountSaved = $state(false);
	let saving = $state(false);

	const categories = [
		{ id: 'appearance', label: 'Look',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>` },
		{ id: 'account', label: 'Account',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>` },
		{ id: 'notifications', label: 'Alerts', soon: true,
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>` },
		{ id: 'filters', label: 'Filters', soon: true,
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>` },
		{ id: 'labels', label: 'Labels', soon: true,
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>` },
	];

	async function toggleTheme() {
		const next = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		document.documentElement.classList.toggle('light', next === 'light');
		await fetch('/api/preferences/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: next })
		});
	}

	async function saveAccountSettings() {
		saving = true;
		accountSaved = false;
		try {
			await fetch('/api/preferences/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName: localDisplayName, signature: localSignature })
			});
			accountSaved = true;
			await invalidateAll();
			setTimeout(() => { accountSaved = false; }, 2000);
		} finally {
			saving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[520px] overflow-hidden
	bg-surface border border-border rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.5)] flex flex-col animate-compose-modal-in">

	<!-- Header -->
	<div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
		<h2 class="text-base font-semibold text-text">Settings</h2>
		<button onclick={onClose}
			class="text-text-tertiary hover:text-text transition-colors cursor-pointer">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>

	<!-- Body: nav + content -->
	<div class="flex flex-1 overflow-hidden min-h-0">
		<!-- Category nav -->
		<nav class="w-44 shrink-0 border-r border-border py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
			{#each categories as cat}
				<button
					onclick={() => { if (!cat.soon) activeCategory = cat.id; }}
					class="flex items-center gap-2.5 py-2 px-3 rounded-lg text-left text-sm
						transition-colors w-full
						{cat.soon
							? 'text-text-tertiary/40 cursor-not-allowed'
							: activeCategory === cat.id
								? 'bg-accent/10 text-accent cursor-pointer'
								: 'text-text-tertiary hover:text-text hover:bg-surface-hover cursor-pointer'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center">{@html cat.icon}</span>
					<span>{cat.label}</span>
				</button>
			{/each}
		</nav>

		<!-- Content panel -->
		<div class="flex-1 overflow-y-auto">
			{#if activeCategory === 'appearance'}
				<div class="px-6 py-5 flex flex-col gap-5">
					<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Appearance</h3>

					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-text font-medium">Theme</p>
							<p class="text-xs text-text-tertiary mt-0.5">Light or dark interface</p>
						</div>
						<button
							onclick={toggleTheme}
							class="relative w-11 h-6 rounded-full transition-colors cursor-pointer
								{theme === 'light' ? 'bg-accent' : 'bg-surface-hover border border-border'}"
						>
							<span class="absolute top-0.5 transition-transform w-5 h-5 rounded-full bg-white shadow-sm
								{theme === 'light' ? 'translate-x-5' : 'translate-x-0.5'}">
							</span>
						</button>
					</div>
					<p class="text-xs text-text-tertiary -mt-2">
						{theme === 'light' ? 'Light mode' : 'Dark mode'}
					</p>
				</div>

			{:else if activeCategory === 'account'}
				<div class="px-6 py-5 flex flex-col gap-5">
					<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Account</h3>

					<div class="flex flex-col gap-1.5">
						<label for="settings-name" class="text-sm font-medium text-text">Display name</label>
						<p class="text-xs text-text-tertiary">Shown in the header and outgoing emails</p>
						<input
							id="settings-name"
							bind:value={localDisplayName}
							type="text"
							placeholder="Your name"
							class="w-full bg-surface-hover border border-border rounded-lg px-3 py-2
								text-sm text-text placeholder-text-tertiary outline-none
								focus:border-accent transition-colors"
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<label for="settings-sig" class="text-sm font-medium text-text">Email signature</label>
						<p class="text-xs text-text-tertiary">Appended to new emails automatically</p>
						<textarea
							id="settings-sig"
							bind:value={localSignature}
							rows={4}
							placeholder="e.g. Best regards,&#10;Odai Ameera"
							class="w-full bg-surface-hover border border-border rounded-lg px-3 py-2
								text-sm text-text placeholder-text-tertiary outline-none resize-none
								focus:border-accent transition-colors font-sans"
						></textarea>
					</div>

					<button
						onclick={saveAccountSettings}
						disabled={saving}
						class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium
							rounded-lg py-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>

					{#if accountSaved}
						<p class="text-xs text-green-400 text-center -mt-2">Saved successfully</p>
					{/if}
				</div>

			{:else}
				<div class="flex flex-col items-center justify-center gap-2 py-12 text-text-tertiary">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75">
						<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
					</svg>
					<p class="text-xs">Coming soon</p>
				</div>
			{/if}
		</div>
	</div>
</div>
