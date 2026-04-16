<script lang="ts">
	import { onMount } from 'svelte';
	import { profilePhoto } from '$lib/stores/profilePhoto';

	let { displayName, email, onClose }: {
		displayName: string;
		email: string;
		onClose: () => void;
	} = $props();

	// Committed state (from store)
	let committedUrl = $state<string | null>(null);
	let committedZoom = $state(1);

	// Pending edit state (before Save)
	let pendingUrl = $state<string | null>(null);
	let pendingZoom = $state(1);
	let editing = $state(false);
	let saving = $state(false);

	let fileInput = $state<HTMLInputElement | undefined>(undefined);

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 3;

	const unsubscribe = profilePhoto.subscribe((s) => {
		committedUrl = s.url;
		committedZoom = s.zoom;
		if (!editing) {
			pendingUrl = s.url;
			pendingZoom = s.zoom;
		}
	});

	onMount(() => {
		profilePhoto.hydrate();
		return () => unsubscribe();
	});

	function handlePhotoClick() {
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
				pendingZoom = 1;
				editing = true;
			} catch {
				pendingUrl = raw;
				pendingZoom = 1;
				editing = true;
			}
		};
		reader.readAsDataURL(file);
		// reset input so selecting the same file twice still fires change
		(e.target as HTMLInputElement).value = '';
	}

	function handleSave() {
		if (!pendingUrl) return;
		saving = true;
		profilePhoto.save(pendingUrl, pendingZoom);
		editing = false;
		saving = false;
	}

	function handleCancel() {
		pendingUrl = committedUrl;
		pendingZoom = committedZoom;
		editing = false;
	}

	function handleRemove() {
		profilePhoto.clear();
		pendingUrl = null;
		pendingZoom = 1;
		editing = false;
	}

	const avatarLetter = $derived(displayName[0]?.toUpperCase() ?? 'O');
	const hasPendingChanges = $derived(
		editing && (pendingUrl !== committedUrl || pendingZoom !== committedZoom)
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
			onclick={handlePhotoClick}
			class="relative w-20 h-20 rounded-2xl overflow-hidden group cursor-pointer bg-accent"
			title="Change photo"
		>
			{#if pendingUrl}
				<img
					src={pendingUrl}
					alt="Profile"
					class="w-full h-full object-cover origin-center"
					style="transform: scale({pendingZoom});"
				/>
			{:else}
				<div class="w-full h-full flex items-center justify-center text-white text-2xl font-semibold">
					{avatarLetter}
				</div>
			{/if}
			<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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

	<!-- Actions -->
	<div class="p-2">
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
