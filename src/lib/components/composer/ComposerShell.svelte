<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import TextAlign from '@tiptap/extension-text-align';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import { TextStyle } from '@tiptap/extension-text-style';
	import FontFamily from '@tiptap/extension-font-family';
	import Color from '@tiptap/extension-color';
	import Highlight from '@tiptap/extension-highlight';
	import Subscript from '@tiptap/extension-subscript';
	import Superscript from '@tiptap/extension-superscript';
	import { Table } from '@tiptap/extension-table';
	import TableRow from '@tiptap/extension-table-row';
	import TableCell from '@tiptap/extension-table-cell';
	import TableHeader from '@tiptap/extension-table-header';
	import Image from '@tiptap/extension-image';
	import { SignatureNode } from '$lib/tiptap/signature-node';

	import {
		composer,
		setMode,
		setSignature,
		setFromIdentity,
		closeCompose
	} from '$lib/stores/compose';
	import { userState } from '$lib/stores/userState';
	import {
		resolveSignatureForIdentity,
		getSignatureById,
		applySignature
	} from '$lib/utils/signatures';
	import { compressImageForBody } from '$lib/utils/image-compress';
	import { showToast } from '$lib/stores/toast';
	import { rememberRecipients } from '$lib/utils/recent-recipients';
	import type { ComposeAttachment } from '$lib/jmap/types';
	import SignaturePicker from './SignaturePicker.svelte';
	import FromPicker from './FromPicker.svelte';
	import RecipientInput from './RecipientInput.svelte';

	let to = $state('');
	let cc = $state('');
	let bcc = $state('');
	let subject = $state('');
	let body = $state('');
	let inReplyTo = $state('');
	let references = $state('');
	let draftId = $state<string | undefined>(undefined);
	let isForward = $state(false);
	let showCc = $state(false);
	let showBcc = $state(false);
	let sending = $state(false);
	let savingDraft = $state(false);
	let discarding = $state(false);
	let error = $state('');
	let importance = $state<'high' | 'normal' | 'low'>('normal');
	let showEmojiPicker = $state(false);

	// --- Attachments ---
	let attachments = $state<ComposeAttachment[]>([]);
	let pendingUploads = $state<{ id: number; name: string; size: number }[]>([]);
	let nextUploadId = 0;
	let fileInputEl = $state<HTMLInputElement | undefined>();

	// --- Inline link popover (replaces window.prompt) ---
	let showLinkPopover = $state(false);
	let linkUrl = $state('');

	const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	let editorEl = $state<HTMLDivElement | undefined>();
	let editor: Editor | null = $state(null);
	let lastMode: 'popup' | 'fullscreen' | 'minimized' | 'closed' = 'closed';
	let lastAppliedSignatureId: number | null | 'unset' = 'unset';

	const EMOJIS = ['😀','😂','🙂','😊','🙏','👍','👎','❤️','🔥','✅','❌','⚠️','📎','📅','💡','🚀','💬','📧','🔒','⭐'];

	// Subject shown in minimized title bar / header
	let displayTitle = $derived(subject || (inReplyTo ? 'Reply' : isForward ? 'Forward' : draftId ? 'Draft' : 'New message'));

	onDestroy(() => editor?.destroy());

	// Build the Tiptap editor on first open. We deliberately keep the editor
	// alive across mode switches (popup ↔ fullscreen ↔ minimized) so editing
	// state — selection, history, scroll — survives.
	function initEditor(initialContent: string) {
		if (editor || !editorEl) return;
		editor = new Editor({
			element: editorEl,
			extensions: [
				StarterKit.configure({ link: false, underline: false }),
				Underline,
				TextAlign.configure({ types: ['heading', 'paragraph'] }),
				Link.configure({ openOnClick: false }),
				Placeholder.configure({ placeholder: 'Write your message...' }),
				TextStyle,
				FontFamily,
				Color,
				Highlight.configure({ multicolor: false }),
				Subscript,
				Superscript,
				Table.configure({ resizable: false }),
				TableRow,
				TableCell,
				TableHeader,
				Image.configure({ inline: false, allowBase64: true }),
				SignatureNode
			],
			content: initialContent,
			onTransaction: () => {
				editor = editor;
			},
			onUpdate: ({ editor: e }) => {
				body = e.getHTML();
			}
		});

		// Tiptap's default paste handler ignores image files. Intercept on the
		// editor's DOM and re-route image pastes through our compressor.
		editor.view.dom.addEventListener('paste', handlePaste);
	}

	async function handlePaste(e: ClipboardEvent) {
		const items = Array.from(e.clipboardData?.items ?? []);
		const imageItems = items.filter((i) => i.type.startsWith('image/'));
		if (imageItems.length === 0) return; // let Tiptap handle text/HTML paste
		e.preventDefault();
		e.stopPropagation();

		for (const item of imageItems) {
			const file = item.getAsFile();
			if (!file) continue;
			if (file.size > 15 * 1024 * 1024) {
				showToast({ message: 'Image too large (15MB max)' });
				continue;
			}
			try {
				const dataUrl = await compressImageForBody(file);
				editor?.chain().focus().setImage({ src: dataUrl }).run();
			} catch (err) {
				console.error('paste image compression failed', err);
				showToast({ message: 'Could not paste image' });
			}
		}
	}

	function isActive(name: string, attrs?: Record<string, unknown>) {
		return editor?.isActive(name, attrs) ?? false;
	}

	function openLinkPopover() {
		linkUrl = (editor?.getAttributes('link').href as string) ?? '';
		showEmojiPicker = false;
		showLinkPopover = true;
	}

	function applyLink() {
		const url = linkUrl.trim();
		if (!url) {
			editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		} else {
			const href = /^[a-z]+:|^\//i.test(url) ? url : `https://${url}`;
			editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
		}
		showLinkPopover = false;
	}

	function insertEmoji(emoji: string) {
		editor?.chain().focus().insertContent(emoji).run();
		showEmojiPicker = false;
	}

	// --- Attachment upload ---
	function triggerFilePick() {
		fileInputEl?.click();
	}

	async function handleFiles(list: FileList | null) {
		if (!list || list.length === 0) return;
		for (const file of Array.from(list)) {
			if (file.size > MAX_ATTACHMENT_BYTES) {
				showToast({ message: `"${file.name}" exceeds the 25MB limit` });
				continue;
			}
			// Use a stable primitive ID rather than object identity. Values placed
			// inside a Svelte $state array may be exposed through a proxy, so the
			// original object is not a reliable removal key in the finally block.
			const marker = { id: nextUploadId++, name: file.name, size: file.size };
			pendingUploads = [...pendingUploads, marker];
			try {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch('/api/upload', { method: 'POST', body: fd });
				const data = await res.json();
				if (res.ok && data.blobId) {
					attachments = [...attachments, data as ComposeAttachment];
				} else {
					showToast({ message: data.error ?? `Could not upload "${file.name}"` });
				}
			} catch {
				showToast({ message: `Could not upload "${file.name}"` });
			} finally {
				pendingUploads = pendingUploads.filter((p) => p.id !== marker.id);
			}
		}
		if (fileInputEl) fileInputEl.value = '';
	}

	function removeAttachment(blobId: string) {
		attachments = attachments.filter((a) => a.blobId !== blobId);
	}

	let dragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = true;
	}

	function handleDrop(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = false;
		handleFiles(e.dataTransfer.files);
	}

	const totalAttachmentBytes = $derived(attachments.reduce((sum, a) => sum + (a.size ?? 0), 0));

	async function postApi(endpoint: string): Promise<{ ok: boolean; error?: string; draftId?: string }> {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				to,
				cc,
				bcc,
				subject,
				body,
				inReplyTo,
				references,
				draftId,
				fromIdentityId: $composer.fromIdentityId,
				attachments
			})
		});
		const result = await res.json();
		if (result.success) return { ok: true, draftId: result.draftId };
		return { ok: false, error: result.error ?? `Server error (${res.status})` };
	}

	async function handleSend() {
		if (!to.trim()) {
			error = 'Recipient is required';
			return;
		}
		if (pendingUploads.length > 0) {
			error = 'Wait for attachments to finish uploading';
			return;
		}
		sending = true;
		error = '';
		try {
			const result = await postApi('/api/send');
			if (result.ok) {
				rememberRecipients([
					...to.split(','),
					...cc.split(','),
					...bcc.split(',')
				]);
				closeCompose();
			} else error = result.error ?? 'Failed to send';
		} catch {
			error = 'Network error';
		} finally {
			sending = false;
		}
	}

	async function handleSaveDraft() {
		if (pendingUploads.length > 0) {
			error = 'Wait for attachments to finish uploading';
			return;
		}
		savingDraft = true;
		error = '';
		try {
			const result = await postApi('/api/draft');
			if (result.ok) {
				draftId = result.draftId;
				closeCompose();
			} else error = result.error ?? 'Failed to save draft';
		} catch {
			error = 'Network error';
		} finally {
			savingDraft = false;
		}
	}

	async function handleDiscard() {
		if (draftId) {
			discarding = true;
			try {
				await fetch('/api/discard', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ draftId })
				});
			} catch {
				/* best effort */
			} finally {
				discarding = false;
			}
		}
		closeCompose();
	}

	function toggleFullscreen() {
		setMode($composer.mode === 'fullscreen' ? 'popup' : 'fullscreen');
	}

	function minimize() {
		setMode('minimized');
	}

	function restoreFromMinimized() {
		setMode('popup');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showLinkPopover) {
			showLinkPopover = false;
			return;
		}
		if (e.key === 'Escape' && $composer.mode === 'fullscreen') {
			setMode('popup');
			return;
		}
		// Cmd/Ctrl+Enter sends from anywhere in the composer.
		if (
			(e.metaKey || e.ctrlKey) &&
			e.key === 'Enter' &&
			$composer.mode !== 'closed' &&
			$composer.mode !== 'minimized' &&
			!sending &&
			!savingDraft
		) {
			e.preventDefault();
			handleSend();
		}
	}

	// Sync local state from the store on each fresh open.
	// We detect "open" as a transition from `closed` → anything else and
	// avoid clobbering local edits on subsequent mode toggles.
	$effect(() => {
		const mode = $composer.mode;
		if (lastMode === 'closed' && mode !== 'closed') {
			const s = $composer;
			to = s.to;
			cc = s.cc;
			bcc = s.bcc;
			subject = s.subject;
			body = s.body;
			inReplyTo = s.inReplyTo ?? '';
			references = s.references ?? '';
			draftId = s.draftId;
			isForward = !!s.isForward;
			showCc = !!s.cc;
			showBcc = !!s.bcc;
			error = '';
			importance = 'normal';
			attachments = [];
			pendingUploads = [];
			showLinkPopover = false;
			lastAppliedSignatureId = 'unset';
		} else if (lastMode !== 'closed' && mode === 'closed') {
			// Tear down Tiptap when the composer fully closes — its mount node
			// is unmounted by the {#if}, so leaving the instance alive points
			// it at a detached element and the next open won't re-init.
			editor?.destroy();
			editor = null;
		}
		lastMode = mode;
	});

	// Spin up Tiptap as soon as the editor mount node exists. Re-fires on
	// every open because we destroyed the editor on close.
	$effect(() => {
		if ($composer.mode === 'closed') return;
		if (!editorEl) return;
		if (editor) return;
		initEditor(body);
	});

	// Pick a default From identity (primary, or the first one we have) the
	// first time the composer opens with no explicit fromIdentityId set.
	$effect(() => {
		if ($composer.mode === 'closed') return;
		if (!$userState.loaded) return;
		if ($composer.fromIdentityId !== null) return;
		const ids = $userState.identities;
		if (ids.length === 0) return;
		const primary = ids.find((i) => i.isPrimary) ?? ids[0];
		setFromIdentity(primary.jmapId);
	});

	// Auto-resolve signature based on the current From identity. Re-runs
	// whenever fromIdentityId changes (so switching aliases swaps to the
	// per-identity override) UNLESS the user has manually picked one — in
	// which case their choice is respected for the rest of the session.
	$effect(() => {
		if ($composer.mode === 'closed') return;
		if (!$userState.loaded) return;
		if ($composer.signatureManuallyChosen) return;
		// New conversations only — don't bury an existing reply/draft body
		// under an auto-signature.
		if (inReplyTo || draftId || isForward) return;
		const id = resolveSignatureForIdentity($composer.fromIdentityId);
		if (id !== $composer.signatureId) setSignature(id, false);
	});

	// Whenever the resolved signatureId changes, rewrite the body so the
	// signature block matches. Skip the very first apply if the body already
	// contains a signature marker (e.g. an existing draft).
	$effect(() => {
		const sigId = $composer.signatureId;
		if ($composer.mode === 'closed') return;
		if (!editor) return;
		if (sigId === lastAppliedSignatureId) return;
		const sig = getSignatureById(sigId);
		const next = applySignature(body, sig?.html ?? null);
		if (next !== body) {
			editor.commands.setContent(next, { emitUpdate: false });
			body = next;
		}
		lastAppliedSignatureId = sigId;
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet attachButton()}
	<button type="button" onclick={triggerFilePick} class="fc-btn" title="Attach file">
		<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
	</button>
{/snippet}

{#snippet linkButton()}
	<div class="relative">
		<button type="button" onclick={openLinkPopover} class="fc-btn {isActive('link') ? 'fc-active' : ''}" title="Insert link">
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
		</button>
		{#if showLinkPopover}
			<div class="absolute top-full left-0 mt-1 z-50 w-72 bg-surface border border-border rounded-lg shadow-xl p-2">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					bind:value={linkUrl}
					type="text"
					placeholder="https://example.com"
					autofocus
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
					class="w-full bg-bg border border-border rounded-md px-2 py-1.5 text-sm text-text outline-none focus:border-accent placeholder-text-tertiary"
				/>
				<div class="flex items-center justify-end gap-1.5 mt-2">
					<button type="button" onclick={() => (showLinkPopover = false)} class="text-xs text-text-tertiary hover:text-text px-2 py-1 rounded-md cursor-pointer">Cancel</button>
					<button type="button" onclick={applyLink} class="text-xs bg-accent hover:bg-accent-hover text-white px-2.5 py-1 rounded-md cursor-pointer">Apply</button>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#if $composer.mode === 'fullscreen'}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/60 z-40 animate-compose-backdrop-in" onclick={() => setMode('popup')}></div>
{/if}

{#if $composer.mode !== 'closed'}
	<!-- Single hidden file input drives every attach button across modes. -->
	<input
		bind:this={fileInputEl}
		type="file"
		multiple
		class="hidden"
		onchange={(e) => handleFiles((e.target as HTMLInputElement).files)}
	/>
	<div
		class="composer-shell animate-compose-shell-in bg-bg border border-border shadow-2xl flex flex-col z-50"
		class:composer--popup={$composer.mode === 'popup'}
		class:composer--fullscreen={$composer.mode === 'fullscreen'}
		class:composer--minimized={$composer.mode === 'minimized'}
		role="dialog"
		aria-label="Compose email"
		aria-modal={$composer.mode === 'fullscreen'}
	>
		<!-- Minimized title bar overlay (always rendered, only visible when minimized) -->
		{#if $composer.mode === 'minimized'}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="flex items-center justify-between px-3 h-10 bg-surface border-b border-border cursor-pointer"
				onclick={restoreFromMinimized}
			>
				<span class="text-xs font-medium text-text truncate flex-1">{displayTitle}</span>
				<div class="flex items-center gap-1 shrink-0 ml-2">
					<button
						onclick={(e) => { e.stopPropagation(); restoreFromMinimized(); }}
						aria-label="Restore"
						class="text-text-tertiary hover:text-text w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover"
					>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
					</button>
					<button
						onclick={(e) => { e.stopPropagation(); handleDiscard(); }}
						aria-label="Close"
						class="text-text-tertiary hover:text-danger w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover"
					>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					</button>
				</div>
			</div>
		{/if}

		<!-- Header (popup + fullscreen) -->
		<div
			class="flex items-center justify-between px-3 h-10 bg-surface border-b border-border shrink-0"
			class:hidden={$composer.mode === 'minimized'}
		>
			<span class="text-xs font-semibold text-text truncate flex-1">{displayTitle}</span>
			<div class="flex items-center gap-0.5 shrink-0 ml-2">
				<button onclick={minimize} aria-label="Minimize" class="header-btn">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="19"/></svg>
				</button>
				<button
					onclick={toggleFullscreen}
					aria-label={$composer.mode === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen'}
					class="header-btn"
				>
					{#if $composer.mode === 'fullscreen'}
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
					{/if}
				</button>
				<button onclick={handleDiscard} aria-label="Close" class="header-btn">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
		</div>

		<!-- Recipient fields -->
		<div class="shrink-0 border-b border-border" class:hidden={$composer.mode === 'minimized'}>
			<FromPicker />
			<div class="relative">
				<RecipientInput bind:value={to} label="To" placeholder="recipient@example.com" />
				{#if !showCc || !showBcc}
					<div class="absolute right-3 top-1.5 flex items-center gap-2">
						{#if !showCc}<button type="button" onclick={() => (showCc = true)} class="text-xs text-text-tertiary hover:text-text cursor-pointer">Cc</button>{/if}
						{#if !showBcc}<button type="button" onclick={() => (showBcc = true)} class="text-xs text-text-tertiary hover:text-text cursor-pointer">Bcc</button>{/if}
					</div>
				{/if}
			</div>
			{#if showCc}
				<RecipientInput bind:value={cc} label="Cc" placeholder="cc@example.com" />
			{/if}
			{#if showBcc}
				<RecipientInput bind:value={bcc} label="Bcc" placeholder="bcc@example.com" />
			{/if}
			<div class="flex items-center px-3 py-1.5">
				<span class="text-xs text-text-tertiary w-12 shrink-0">Subject</span>
				<input bind:value={subject} type="text" placeholder="Subject" class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
			</div>
		</div>

		<!-- Ribbon — popup gets a minimal single row, fullscreen gets the full Outlook-style two-row ribbon. -->
		{#if $composer.mode === 'popup'}
			<div class="shrink-0 border-b border-border bg-surface px-3 py-1.5 flex items-center gap-1 flex-wrap">
				<button type="button" onclick={() => editor?.chain().focus().toggleBold().run()} class="fc-btn {isActive('bold') ? 'fc-active' : ''}" title="Bold"><strong>B</strong></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleItalic().run()} class="fc-btn {isActive('italic') ? 'fc-active' : ''}" title="Italic"><em>I</em></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleUnderline().run()} class="fc-btn {isActive('underline') ? 'fc-active' : ''}" title="Underline"><u>U</u></button>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().toggleBulletList().run()} class="fc-btn {isActive('bulletList') ? 'fc-active' : ''}" title="Bullet list">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().toggleOrderedList().run()} class="fc-btn {isActive('orderedList') ? 'fc-active' : ''}" title="Numbered list">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
				</button>
				<div class="fc-sep"></div>
				{@render linkButton()}
				<div class="relative">
					<button type="button" onclick={() => (showEmojiPicker = !showEmojiPicker)} class="fc-btn {showEmojiPicker ? 'fc-active' : ''}" title="Insert emoji">
						<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
					</button>
					{#if showEmojiPicker}
						<div class="absolute bottom-8 left-0 z-50 bg-surface border border-border rounded-lg p-2 grid grid-cols-5 gap-1 shadow-lg">
							{#each EMOJIS as emoji}
								<button type="button" onclick={() => insertEmoji(emoji)} class="w-7 h-7 flex items-center justify-center text-base rounded-md hover:bg-surface-hover cursor-pointer">{emoji}</button>
							{/each}
						</div>
					{/if}
				</div>
				{@render attachButton()}
				<div class="fc-sep"></div>
				<button type="button" onclick={() => (importance = importance === 'high' ? 'normal' : 'high')} class="fc-btn {importance === 'high' ? 'fc-active-red' : ''}" title="High importance">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
				</button>
				<div class="flex-1"></div>
				<SignaturePicker />
			</div>
		{:else if $composer.mode === 'fullscreen'}
		<div class="shrink-0 border-b border-border bg-surface px-3 py-2 flex flex-col gap-2">
			<!-- Row 1: Text formatting -->
			<div class="flex items-center gap-1 flex-wrap">
				<select onchange={(e) => editor?.chain().focus().setFontFamily((e.target as HTMLSelectElement).value).run()} class="fc-select w-[110px]">
					<option value="Calibri, 'Segoe UI', Arial, sans-serif">Calibri</option>
					<option value="Arial, sans-serif">Arial</option>
					<option value="'Times New Roman', serif">Times New Roman</option>
					<option value="'Courier New', monospace">Courier New</option>
					<option value="Georgia, serif">Georgia</option>
					<option value="Verdana, sans-serif">Verdana</option>
				</select>
				<select onchange={(e) => editor?.chain().focus().setMark('textStyle', { fontSize: (e.target as HTMLSelectElement).value + 'pt' }).run()} class="fc-select w-14">
					{#each [8,9,10,11,12,14,16,18,20,24,28,36,48,72] as size}<option value={size} selected={size === 12}>{size}</option>{/each}
				</select>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().toggleBold().run()} class="fc-btn {isActive('bold') ? 'fc-active' : ''}" title="Bold"><strong>B</strong></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleItalic().run()} class="fc-btn {isActive('italic') ? 'fc-active' : ''}" title="Italic"><em>I</em></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleUnderline().run()} class="fc-btn {isActive('underline') ? 'fc-active' : ''}" title="Underline"><u>U</u></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleStrike().run()} class="fc-btn {isActive('strike') ? 'fc-active' : ''}" title="Strikethrough"><s>S</s></button>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().toggleHighlight().run()} class="fc-btn {isActive('highlight') ? 'fc-active' : ''}" title="Highlight">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
				</button>
				<label class="fc-btn cursor-pointer" title="Font color">
					<input type="color" class="sr-only" oninput={(e) => editor?.chain().focus().setColor((e.target as HTMLInputElement).value).run()} />
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 20h16M8 16L12 4l4 12M9.5 12h5"/></svg>
				</label>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().toggleSubscript().run()} class="fc-btn {isActive('subscript') ? 'fc-active' : ''}" title="Subscript">x<sub>2</sub></button>
				<button type="button" onclick={() => editor?.chain().focus().toggleSuperscript().run()} class="fc-btn {isActive('superscript') ? 'fc-active' : ''}" title="Superscript">x<sup>2</sup></button>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => (importance = importance === 'high' ? 'normal' : 'high')} class="fc-btn {importance === 'high' ? 'fc-active-red' : ''}" title="High importance">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
				</button>
				<button type="button" onclick={() => (importance = importance === 'low' ? 'normal' : 'low')} class="fc-btn {importance === 'low' ? 'fc-active-blue' : ''}" title="Low importance">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
				</button>
			</div>

			<!-- Row 2: Paragraph + Insert + Signature -->
			<div class="flex items-center gap-1 flex-wrap">
				<button type="button" onclick={() => editor?.chain().focus().toggleBulletList().run()} class="fc-btn {isActive('bulletList') ? 'fc-active' : ''}" title="Bullet list">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().toggleOrderedList().run()} class="fc-btn {isActive('orderedList') ? 'fc-active' : ''}" title="Numbered list">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().sinkListItem('listItem').run()} class="fc-btn" title="Indent">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><polyline points="3 9 7 12 3 15"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().liftListItem('listItem').run()} class="fc-btn" title="Outdent">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><polyline points="7 9 3 12 7 15"/></svg>
				</button>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().setTextAlign('left').run()} class="fc-btn {isActive('', { textAlign: 'left' }) ? 'fc-active' : ''}" title="Align left">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().setTextAlign('center').run()} class="fc-btn {isActive('', { textAlign: 'center' }) ? 'fc-active' : ''}" title="Align center">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
				</button>
				<button type="button" onclick={() => editor?.chain().focus().setTextAlign('right').run()} class="fc-btn {isActive('', { textAlign: 'right' }) ? 'fc-active' : ''}" title="Align right">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
				</button>
				<select
					onchange={(e) => {
						const v = (e.target as HTMLSelectElement).value;
						if (v === 'p') editor?.chain().focus().setParagraph().run();
						else editor?.chain().focus().setHeading({ level: parseInt(v) as 1 | 2 | 3 }).run();
					}}
					class="fc-select w-[100px] ml-1"
				>
					<option value="p">Normal</option>
					<option value="1">Heading 1</option>
					<option value="2">Heading 2</option>
					<option value="3">Heading 3</option>
				</select>
				<div class="fc-sep"></div>
				{@render linkButton()}
				<div class="relative">
					<button type="button" onclick={() => (showEmojiPicker = !showEmojiPicker)} class="fc-btn {showEmojiPicker ? 'fc-active' : ''}" title="Insert emoji">
						<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
					</button>
					{#if showEmojiPicker}
						<div class="absolute bottom-8 left-0 z-50 bg-surface border border-border rounded-lg p-2 grid grid-cols-5 gap-1 shadow-lg">
							{#each EMOJIS as emoji}
								<button type="button" onclick={() => insertEmoji(emoji)} class="w-7 h-7 flex items-center justify-center text-base rounded-md hover:bg-surface-hover cursor-pointer">{emoji}</button>
							{/each}
						</div>
					{/if}
				</div>
				{@render attachButton()}
				<button type="button" onclick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} class="fc-btn" title="Insert 3x3 table">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
				</button>
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} class="fc-btn" title="Clear formatting">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20 5H9l-7 7 7 7h11a2 2 0 002-2V7a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
				</button>
				{#if isActive('table')}
					<div class="fc-sep"></div>
					<button type="button" onclick={() => editor?.chain().focus().addRowAfter().run()} class="fc-btn" title="Add row">+Row</button>
					<button type="button" onclick={() => editor?.chain().focus().deleteRow().run()} class="fc-btn" title="Delete row">−Row</button>
					<button type="button" onclick={() => editor?.chain().focus().addColumnAfter().run()} class="fc-btn" title="Add column">+Col</button>
					<button type="button" onclick={() => editor?.chain().focus().deleteColumn().run()} class="fc-btn" title="Delete column">−Col</button>
					<button type="button" onclick={() => editor?.chain().focus().deleteTable().run()} class="fc-btn text-danger" title="Delete table">×Table</button>
				{/if}
				<div class="fc-sep"></div>
				<SignaturePicker />
			</div>
		</div>
		{/if}

		{#if error}
			<div class="px-3 py-1.5 bg-danger/10 border-b border-danger/20 shrink-0" class:hidden={$composer.mode === 'minimized'}>
				<p class="text-xs text-danger">{error}</p>
			</div>
		{/if}

		<!-- Editor body — always rendered, height clipped when minimized -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-1 overflow-y-auto px-4 py-3 min-h-0"
			class:hidden={$composer.mode === 'minimized'}
			ondragover={handleDragOver}
			ondragleave={() => (dragOver = false)}
			ondrop={handleDrop}
		>
			<div bind:this={editorEl} class="min-h-full full-composer-editor"></div>
			{#if dragOver}
				<div class="absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10 pointer-events-none">
					<span class="text-sm font-medium text-accent-fg">Drop files to attach</span>
				</div>
			{/if}
		</div>

		<!-- Attachment tray -->
		{#if attachments.length > 0 || pendingUploads.length > 0}
			<div class="shrink-0 border-t border-border bg-surface px-3 py-2" class:hidden={$composer.mode === 'minimized'}>
				<div class="flex items-center justify-between mb-1.5">
					<span class="text-2xs font-medium text-text-tertiary uppercase tracking-wider">
						{attachments.length} attachment{attachments.length === 1 ? '' : 's'}
						{#if totalAttachmentBytes > 0}<span class="normal-case tracking-normal">· {formatBytes(totalAttachmentBytes)}</span>{/if}
					</span>
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each attachments as a (a.blobId)}
						<span class="inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md bg-bg border border-border text-xs text-text-secondary max-w-[220px]">
							<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" class="shrink-0 text-text-tertiary"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
							<span class="truncate" title={a.name}>{a.name}</span>
							<span class="shrink-0 text-text-tertiary tabular-nums">{formatBytes(a.size)}</span>
							<button type="button" onclick={() => removeAttachment(a.blobId)} class="shrink-0 p-0.5 rounded-md hover:bg-surface-hover hover:text-danger cursor-pointer" aria-label={`Remove ${a.name}`}>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
							</button>
						</span>
					{/each}
					{#each pendingUploads as p (p.id)}
						<span class="inline-flex items-center gap-1.5 h-7 px-2 rounded-md bg-bg border border-border text-xs text-text-tertiary max-w-[220px]">
							<svg viewBox="0 0 24 24" width="13" height="13" class="shrink-0 animate-spin" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
							<span class="truncate">{p.name}</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Footer -->
		<div
			class="flex items-center justify-between px-3 py-2 border-t border-border shrink-0 bg-surface"
			class:hidden={$composer.mode === 'minimized'}
		>
			<div class="flex items-center gap-2">
				<button
					onclick={handleSend}
					disabled={sending || savingDraft}
					title="Send (⌘↵)"
					class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
				>
					{sending ? 'Sending...' : 'Send'}
				</button>
				<button
					onclick={handleSaveDraft}
					disabled={sending || savingDraft}
					class="text-text-secondary hover:text-text text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
			</div>
			<button
				onclick={handleDiscard}
				disabled={sending || savingDraft || discarding}
				class="text-text-tertiary hover:text-danger text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
			>
				{discarding ? 'Discarding...' : 'Discard'}
			</button>
		</div>
	</div>
{/if}

<style>
	.composer-shell {
		position: fixed;
		border-radius: 12px;
		overflow: hidden;
		transition: width 0.18s ease, height 0.18s ease, top 0.18s ease, left 0.18s ease, bottom 0.18s ease, right 0.18s ease, border-radius 0.18s ease;
	}
	.composer--popup {
		bottom: 16px;
		right: 16px;
		width: 540px;
		height: 640px;
		max-height: calc(100vh - 32px);
		max-width: calc(100vw - 32px);
	}
	.composer--fullscreen {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 80vw;
		height: 84vh;
		max-width: 1100px;
	}
	.composer--minimized {
		bottom: 0;
		right: 16px;
		width: 320px;
		height: 40px;
		border-radius: 10px 10px 0 0;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 4px;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.header-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	/*
	 * The .fc-* toolbar rules live in routes/layout.css. They were duplicated
	 * here as :global() overrides, which shipped in a second chunk and silently
	 * won on some properties — including a plain :hover that highlighted
	 * disabled buttons. One definition now.
	 */
	:global(.full-composer-editor .ProseMirror) {
		outline: none;
		min-height: 200px;
		font-family: Calibri, 'Segoe UI', Arial, sans-serif;
		font-size: 14px;
		line-height: 1.5;
		color: var(--color-text);
	}
	/* Outlook-style single-spacing: Enter starts a new paragraph that sits
	   directly below the previous one. No per-paragraph bottom margin, so the
	   text doesn't read as double-spaced. An explicit blank line still creates
	   a real gap. */
	:global(.full-composer-editor .ProseMirror p) {
		margin: 0;
	}
	:global(.full-composer-editor .ProseMirror ul) {
		list-style: disc;
		padding-left: 1.5em;
	}
	:global(.full-composer-editor .ProseMirror ol) {
		list-style: decimal;
		padding-left: 1.5em;
	}
	:global(.full-composer-editor .ProseMirror a) {
		color: var(--color-accent);
		text-decoration: underline;
	}
	:global(.full-composer-editor .ProseMirror img) {
		max-width: 100%;
		height: auto;
		border-radius: 4px;
	}
	:global(.full-composer-editor .ProseMirror blockquote) {
		border-left: 3px solid var(--color-border);
		padding-left: 1em;
		margin-left: 0;
		color: var(--color-text-secondary);
	}
	:global(.full-composer-editor .ProseMirror .is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--color-text-tertiary);
		pointer-events: none;
		float: left;
		height: 0;
	}
</style>
