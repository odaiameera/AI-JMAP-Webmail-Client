<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { profilePhoto } from '$lib/stores/profilePhoto';
	import type { LinkedAccount } from '$lib/types/accounts';

	let { displayName, email, accounts = [], activeAccountId = null, accountUnread = {}, onClose }: {
		displayName: string;
		email: string;
		accounts?: LinkedAccount[];
		activeAccountId?: string | null;
		accountUnread?: Record<string, number>;
		onClose: () => void;
	} = $props();

	let switching = $state<string | null>(null);
	const otherAccounts = $derived(accounts.filter((a) => a.id !== activeAccountId));

	async function switchAccount(id: string) {
		if (switching) return;
		switching = id;
		try {
			const res = await fetch('/api/accounts/switch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (res.ok) {
				// Land on the inbox of the newly active account with fresh data.
				await goto('/inbox', { invalidateAll: true });
				onClose();
			}
		} finally {
			switching = null;
		}
	}

	async function manageAccounts() {
		onClose();
		await goto('/settings/accounts');
	}

	// Committed state (mirrors the store)
	let committedUrl = $state<string | null>(null);
	let committedZoom = $state(1);
	let committedOffsetX = $state(0);
	let committedOffsetY = $state(0);

	// Pending edit state (before Save)
	let pendingUrl = $state<string | null>(null);
	let pendingZoom = $state(1);
	let pendingOffsetX = $state(0);
	let pendingOffsetY = $state(0);
	let editing = $state(false);
	let saving = $state(false);

	let fileInput = $state<HTMLInputElement | undefined>(undefined);
	let avatarEl = $state<HTMLButtonElement | undefined>(undefined);

	// Drag state
	const AVATAR_SIZE = 80; // px — the editor avatar is 80×80
	let dragging = $state(false);
	let justDragged = false; // suppress click-to-open-picker after a drag
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffsetX = 0;
	let dragStartOffsetY = 0;

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 3;

	const unsubscribe = profilePhoto.subscribe((s) => {
		committedUrl = s.url;
		committedZoom = s.zoom;
		committedOffsetX = s.offsetX;
		committedOffsetY = s.offsetY;
		if (!editing) {
			pendingUrl = s.url;
			pendingZoom = s.zoom;
			pendingOffsetX = s.offsetX;
			pendingOffsetY = s.offsetY;
		}
	});

	onMount(() => {
		profilePhoto.hydrate();
		return () => unsubscribe();
	});

	/**
	 * Bound the pan so the image edges can't be dragged inside the crop frame.
	 * The image is sized to cover the 80×80 box, then scaled by `zoom`. Excess
	 * on each side (which can be panned into view) is `(80*zoom - 80) / 2`.
	 */
	function clampOffset(x: number, y: number, zoom: number): { x: number; y: number } {
		const excess = (AVATAR_SIZE * zoom - AVATAR_SIZE) / 2;
		const max = Math.max(0, excess);
		return {
			x: Math.max(-max, Math.min(max, x)),
			y: Math.max(-max, Math.min(max, y))
		};
	}

	// Re-clamp pan whenever zoom changes so shrinking doesn't leave the image
	// outside its valid range.
	$effect(() => {
		const clamped = clampOffset(pendingOffsetX, pendingOffsetY, pendingZoom);
		if (clamped.x !== pendingOffsetX) pendingOffsetX = clamped.x;
		if (clamped.y !== pendingOffsetY) pendingOffsetY = clamped.y;
	});

	function handlePhotoClick() {
		// If the pointerup just ended a drag, swallow the synthetic click
		// rather than opening the file picker.
		if (justDragged) {
			justDragged = false;
			return;
		}
		fileInput?.click();
	}

	/**
	 * Downscale and re-encode to JPEG to keep localStorage small and
	 * rendering fast. Output max dim 256px, quality 0.85.
	 */
	async function resizeImage(dataUrl: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const maxDim = 256;
				const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
				const w = Math.round(img.width * scale);
				const h = Math.round(img.height * scale);
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (!ctx) return reject(new Error('no ctx'));
				ctx.drawImage(img, 0, 0, w, h);
				resolve(canvas.toDataURL('image/jpeg', 0.85));
			};
			img.onerror = () => reject(new Error('image load failed'));
			img.src = dataUrl;
		});
	}

	function handleFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async () => {
			const raw = reader.result as string;
			try {
				const compressed = await resizeImage(raw);
				pendingUrl = compressed;
			} catch {
				pendingUrl = raw;
			}
			pendingZoom = 1;
			pendingOffsetX = 0;
			pendingOffsetY = 0;
			editing = true;
		};
		reader.readAsDataURL(file);
		// reset input so selecting the same file twice still fires change
		(e.target as HTMLInputElement).value = '';
	}

	function handleSave() {
		if (!pendingUrl) return;
		saving = true;
		profilePhoto.save(pendingUrl, pendingZoom, pendingOffsetX, pendingOffsetY);
		editing = false;
		saving = false;
	}

	function handleCancel() {
		pendingUrl = committedUrl;
		pendingZoom = committedZoom;
		pendingOffsetX = committedOffsetX;
		pendingOffsetY = committedOffsetY;
		editing = false;
	}

	function handleRemove() {
		profilePhoto.clear();
		pendingUrl = null;
		pendingZoom = 1;
		pendingOffsetX = 0;
		pendingOffsetY = 0;
		editing = false;
	}

	// --- Drag handlers (pointer events cover mouse + touch + pen) ---

	function onPointerDown(e: PointerEvent) {
		if (!pendingUrl) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		justDragged = false;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartOffsetX = pendingOffsetX;
		dragStartOffsetY = pendingOffsetY;
		editing = true;
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		// Flag as a drag once the pointer has moved past a small threshold,
		// so a tiny jitter on a plain click still opens the file picker.
		if (!justDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
			justDragged = true;
		}
		const clamped = clampOffset(
			dragStartOffsetX + dx,
			dragStartOffsetY + dy,
			pendingZoom
		);
		pendingOffsetX = clamped.x;
		pendingOffsetY = clamped.y;
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore — pointer may already be released
		}
	}

	const avatarLetter = $derived(displayName[0]?.toUpperCase() ?? 'O');
	const hasPendingChanges = $derived(
		editing && (
			pendingUrl !== committedUrl ||
			pendingZoom !== committedZoom ||
			pendingOffsetX !== committedOffsetX ||
			pendingOffsetY !== committedOffsetY
		)
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (editing) handleCancel();
			else onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="w-72 bg-surface border border-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden animate-compose-modal-in">
	<!-- Avatar section -->
	<div class="flex flex-col items-center pt-6 pb-4 px-4 gap-3">
		<button
			bind:this={avatarEl}
			onclick={handlePhotoClick}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			class="relative w-20 h-20 rounded-2xl overflow-hidden group bg-accent touch-none
				{pendingUrl ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}"
			title={pendingUrl ? 'Drag to reposition, click to change' : 'Click to upload'}
		>
			{#if pendingUrl}
				<img
					src={pendingUrl}
					alt="Profile"
					class="w-full h-full object-cover origin-center pointer-events-none select-none"
					style="transform: translate({pendingOffsetX}px, {pendingOffsetY}px) scale({pendingZoom});"
					draggable="false"
				/>
			{:else}
				<div class="w-full h-full flex items-center justify-center text-white text-2xl font-semibold pointer-events-none">
					{avatarLetter}
				</div>
			{/if}
			<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.75">
					<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
					<circle cx="12" cy="13" r="4"/>
				</svg>
			</div>
		</button>
		<input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={handleFileChange} />

		<!-- Zoom slider (visible while editing OR when a photo is committed) -->
		{#if pendingUrl}
			<div class="w-full flex items-center gap-2 px-1">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary shrink-0">
					<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>
				</svg>
				<input
					type="range"
					min={MIN_ZOOM}
					max={MAX_ZOOM}
					step="0.01"
					bind:value={pendingZoom}
					oninput={() => { editing = true; }}
					class="flex-1 accent-accent cursor-pointer"
					title="Zoom"
				/>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary shrink-0">
					<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/>
				</svg>
			</div>
		{/if}

		<div class="text-center">
			<p class="text-sm font-semibold text-text">{displayName}</p>
			<p class="text-xs text-text-tertiary mt-0.5">{email}</p>
		</div>

		<!-- Save / Cancel / Remove buttons -->
		{#if editing}
			<div class="w-full flex items-center gap-2">
				<button
					type="button"
					onclick={handleCancel}
					class="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleSave}
					disabled={saving || !hasPendingChanges || !pendingUrl}
					class="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		{:else if committedUrl}
			<button
				type="button"
				onclick={handleRemove}
				class="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
			>
				Remove photo
			</button>
		{/if}
	</div>

	<div class="border-t border-border"></div>

	<!-- Account switcher -->
	{#if otherAccounts.length > 0}
		<div class="p-2">
			{#each otherAccounts as account (account.id)}
				<button
					type="button"
					onclick={() => switchAccount(account.id)}
					disabled={switching !== null}
					class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary
						hover:text-text hover:bg-surface-hover transition-colors cursor-pointer text-left
						disabled:opacity-60 disabled:cursor-wait"
				>
					<span
						class="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-2xs font-semibold"
						style="background-color: {account.color}"
					>
						{account.email[0]?.toUpperCase()}
					</span>
					<span class="flex-1 min-w-0">
						<span class="block truncate">{account.displayName ?? account.email.split('@')[0]}</span>
						<span class="block truncate text-xs text-text-tertiary">{account.email}</span>
					</span>
					{#if account.needsReauth}
						<span class="text-3xs text-danger shrink-0" title="Reconnect required">!</span>
					{:else if accountUnread[account.id]}
						<span class="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-accent/15 text-accent text-2xs font-semibold flex items-center justify-center">
							{accountUnread[account.id] > 99 ? '99+' : accountUnread[account.id]}
						</span>
					{/if}
				</button>
			{/each}
		</div>
		<div class="border-t border-border"></div>
	{/if}

	<!-- Actions -->
	<div class="p-2">
		<button
			type="button"
			onclick={manageAccounts}
			class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer text-left"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="9" cy="7" r="4"/>
				<path d="M2 21v-2a4 4 0 014-4h6"/>
				<line x1="19" y1="8" x2="19" y2="14"/>
				<line x1="16" y1="11" x2="22" y2="11"/>
			</svg>
			Add or manage accounts
		</button>
		<form method="POST" action="/logout">
			<button
				type="submit"
				class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer text-left"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
					<polyline points="16 17 21 12 16 7"/>
					<line x1="21" y1="12" x2="9" y2="12"/>
				</svg>
				Sign out
			</button>
		</form>
	</div>
</div>
