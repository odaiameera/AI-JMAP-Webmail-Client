<script lang="ts">
	import type { EmailAttachment } from '$lib/jmap/types';
	import type { ViewerAttachment } from '$lib/attachments/types';
	import { detectKind } from '$lib/attachments/detect';
	import { attachmentUrl } from '$lib/attachments/fetch';
	import ViewerModal from './viewers/ViewerModal.svelte';

	let { emailId, attachments }: {
		emailId: string;
		attachments: EmailAttachment[];
	} = $props();

	/**
	 * Real attachments only — filter out inline parts (images referenced
	 * via `cid:` inside the HTML body). Those render through the body,
	 * not as downloadable files.
	 */
	const files = $derived(
		attachments.filter((a) => a.disposition !== 'inline' && !a.cid)
	);

	let activeAttachment = $state<ViewerAttachment | null>(null);

	function openViewer(a: EmailAttachment) {
		activeAttachment = {
			emailId,
			blobId: a.blobId,
			name: a.name ?? 'attachment',
			type: a.type,
			size: a.size,
			kind: detectKind(a.type, a.name)
		};
	}

	function downloadAttachment(a: EmailAttachment, e: MouseEvent) {
		e.stopPropagation();
		const name = a.name ?? 'attachment';
		const link = document.createElement('a');
		link.href = attachmentUrl(emailId, a.blobId, name);
		link.download = name;
		link.click();
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	type IconKind = 'image' | 'pdf' | 'video' | 'audio' | 'archive' | 'doc' | 'sheet' | 'slides' | 'file';

	function iconKindFor(type: string): IconKind {
		if (type.startsWith('image/')) return 'image';
		if (type === 'application/pdf') return 'pdf';
		if (type.startsWith('video/')) return 'video';
		if (type.startsWith('audio/')) return 'audio';
		if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return 'archive';
		if (type.includes('word') || type.includes('document')) return 'doc';
		if (type.includes('sheet') || type.includes('excel')) return 'sheet';
		if (type.includes('presentation') || type.includes('powerpoint')) return 'slides';
		return 'file';
	}
</script>

{#if files.length > 0}
	<div class="border-t border-border px-6 py-3 shrink-0">
		<div class="text-xs text-text-tertiary mb-2">
			{files.length} {files.length === 1 ? 'attachment' : 'attachments'}
		</div>
		<div class="flex flex-wrap gap-2">
			{#each files as a (a.blobId)}
				{@const kind = iconKindFor(a.type)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					onclick={() => openViewer(a)}
					title={`${a.name ?? 'attachment'} · ${formatSize(a.size)}`}
					class="flex items-center gap-2 px-3 py-2 bg-surface-hover border border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer group max-w-[280px]"
				>
					<span class="shrink-0 text-text-secondary group-hover:text-accent transition-colors">
						{#if kind === 'image'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
						{:else if kind === 'pdf'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7.5" y="17.5" font-size="5.5" font-family="sans-serif" font-weight="700" fill="currentColor" stroke="none">PDF</text></svg>
						{:else if kind === 'video'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
						{:else if kind === 'audio'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
						{:else if kind === 'archive'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
						{:else if kind === 'doc' || kind === 'sheet' || kind === 'slides'}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
						{:else}
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<div class="text-sm text-text truncate">{a.name ?? 'unnamed'}</div>
						<div class="text-xs text-text-tertiary">{formatSize(a.size)}</div>
					</div>
					<button
						onclick={(e) => downloadAttachment(a, e)}
						title="Download"
						class="shrink-0 p-1 rounded text-text-tertiary hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
					>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
							<polyline points="7 10 12 15 17 10"/>
							<line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

{#if activeAttachment}
	<ViewerModal attachment={activeAttachment} onClose={() => (activeAttachment = null)} />
{/if}
