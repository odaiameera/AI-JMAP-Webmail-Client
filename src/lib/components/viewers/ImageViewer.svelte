<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	import { attachmentUrl } from '$lib/attachments/fetch';

	let { attachment }: { attachment: ViewerAttachment } = $props();

	let zoom = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffsetX = 0;
	let dragStartOffsetY = 0;

	const src = $derived(attachmentUrl(attachment.emailId, attachment.blobId, attachment.name));

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		zoom = Math.max(0.2, Math.min(10, zoom * delta));
	}

	function onPointerDown(e: PointerEvent) {
		if (zoom <= 1) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartOffsetX = offsetX;
		dragStartOffsetY = offsetY;
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		offsetX = dragStartOffsetX + (e.clientX - dragStartX);
		offsetY = dragStartOffsetY + (e.clientY - dragStartY);
	}

	function onPointerUp(e: PointerEvent) {
		dragging = false;
		try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
	}

	function reset() {
		zoom = 1;
		offsetX = 0;
		offsetY = 0;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="w-full h-full flex items-center justify-center overflow-hidden select-none"
	class:cursor-grab={zoom > 1 && !dragging}
	class:cursor-grabbing={dragging}
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={reset}
>
	<img
		{src}
		alt={attachment.name}
		draggable="false"
		class="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-75"
		style="transform: translate({offsetX}px, {offsetY}px) scale({zoom});"
	/>
</div>

<div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface border border-border rounded-full px-2 py-1 shadow-lg">
	<button onclick={() => { zoom = Math.max(0.2, zoom * 0.8); }} title="Zoom out"
		class="p-1.5 rounded-full text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75">
			<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>
		</svg>
	</button>
	<span class="text-xs text-text-tertiary tabular-nums px-2 w-14 text-center">{Math.round(zoom * 100)}%</span>
	<button onclick={() => { zoom = Math.min(10, zoom * 1.25); }} title="Zoom in"
		class="p-1.5 rounded-full text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75">
			<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/>
		</svg>
	</button>
	<div class="w-px h-4 bg-border mx-1"></div>
	<button onclick={reset} title="Reset (double-click also resets)"
		class="px-2 py-1 rounded-full text-xs text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer">
		Reset
	</button>
</div>
