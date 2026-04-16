<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	import ImageViewer from './ImageViewer.svelte';
	import PdfViewer from './PdfViewer.svelte';
	import TextViewer from './TextViewer.svelte';
	import DocxViewer from './DocxViewer.svelte';
	import XlsxViewer from './XlsxViewer.svelte';
	import UnsupportedViewer from './UnsupportedViewer.svelte';
	import { attachmentUrl } from '$lib/attachments/fetch';

	let { attachment, onClose }: {
		attachment: ViewerAttachment;
		onClose: () => void;
	} = $props();

	function handleDownload() {
		const link = document.createElement('a');
		link.href = attachmentUrl(attachment.emailId, attachment.blobId, attachment.name, { download: true });
		link.download = attachment.name;
		link.click();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 bg-black/70 z-50 animate-compose-backdrop-in"
	onclick={onClose}
></div>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-4 md:inset-8 z-50 bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-compose-modal-in"
	onclick={(e) => e.stopPropagation()}
>
	<div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-surface">
		<div class="flex items-center gap-3 min-w-0">
			<span class="text-sm font-medium text-text truncate">{attachment.name}</span>
			<span class="text-xs text-text-tertiary shrink-0">{formatSize(attachment.size)}</span>
		</div>
		<div class="flex items-center gap-1 shrink-0">
			<button
				onclick={handleDownload}
				title="Download"
				class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
			>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
					<polyline points="7 10 12 15 17 10"/>
					<line x1="12" y1="15" x2="12" y2="3"/>
				</svg>
				Download
			</button>
			<button
				onclick={onClose}
				title="Close (Esc)"
				class="p-1.5 rounded-lg text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
			>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75">
					<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>
	</div>

	<div class="relative flex-1 overflow-hidden min-h-0 bg-bg">
		{#if attachment.kind === 'image'}
			<ImageViewer {attachment} />
		{:else if attachment.kind === 'pdf'}
			<PdfViewer {attachment} />
		{:else if attachment.kind === 'text'}
			<TextViewer {attachment} />
		{:else if attachment.kind === 'docx'}
			<DocxViewer {attachment} />
		{:else if attachment.kind === 'xlsx'}
			<XlsxViewer {attachment} />
		{:else}
			<UnsupportedViewer {attachment} onDownload={handleDownload} />
		{/if}
	</div>
</div>
