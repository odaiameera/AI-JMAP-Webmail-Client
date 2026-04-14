<script lang="ts">
	import { fullComposeData, closeFullCompose } from '$lib/stores/compose';
	import { onMount, onDestroy } from 'svelte';
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

	const data = $fullComposeData;

	let to = $state(data?.to ?? '');
	let cc = $state(data?.cc ?? '');
	let subject = $state(data?.subject ?? '');
	let body = $state(data?.body ?? '');
	let inReplyTo = $state(data?.inReplyTo ?? '');
	let references = $state(data?.references ?? '');
	let draftId = $state(data?.draftId);
	let showCc = $state(!!data?.cc);
	let sending = $state(false);
	let savingDraft = $state(false);
	let discarding = $state(false);
	let error = $state('');
	let importance = $state<'high' | 'normal' | 'low'>('normal');
	let showEmoji = $state(false);

	let editorEl: HTMLDivElement;
	let editor: Editor | null = $state(null);

	const EMOJIS = ['😀','😂','🙂','😊','🙏','👍','👎','❤️','🔥','✅','❌','⚠️','📎','📅','💡','🚀','💬','📧','🔒','⭐'];

	onMount(() => {
		editor = new Editor({
			element: editorEl,
			extensions: [
				StarterKit,
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
				TableRow, TableCell, TableHeader
			],
			content: body,
			onTransaction: () => { editor = editor; },
			onUpdate: ({ editor: e }) => { body = e.getHTML(); }
		});
	});

	onDestroy(() => editor?.destroy());

	function setLink() {
		const url = window.prompt('URL:', editor?.getAttributes('link').href ?? 'https://');
		if (url === null) return;
		if (url === '') editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		else editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	function insertEmoji(emoji: string) {
		editor?.chain().focus().insertContent(emoji).run();
		showEmoji = false;
	}

	async function postApi(endpoint: string): Promise<{ ok: boolean; error?: string; draftId?: string }> {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ to, cc, subject, body, inReplyTo, references, draftId })
		});
		const result = await res.json();
		if (result.success) return { ok: true, draftId: result.draftId };
		return { ok: false, error: result.error ?? `Server error (${res.status})` };
	}

	async function handleSend() {
		if (!to.trim()) { error = 'Recipient is required'; return; }
		sending = true; error = '';
		try {
			const result = await postApi('/api/send');
			if (result.ok) closeFullCompose();
			else error = result.error ?? 'Failed to send';
		} catch { error = 'Network error'; }
		finally { sending = false; }
	}

	async function handleSaveDraft() {
		savingDraft = true; error = '';
		try {
			const result = await postApi('/api/draft');
			if (result.ok) { draftId = result.draftId; closeFullCompose(); }
			else error = result.error ?? 'Failed to save draft';
		} catch { error = 'Network error'; }
		finally { savingDraft = false; }
	}

	async function handleDiscard() {
		if (draftId) {
			discarding = true;
			try { await fetch('/api/discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId }) }); }
			catch { /* best effort */ }
			finally { discarding = false; }
		}
		closeFullCompose();
	}
</script>

<div class="h-full flex flex-col bg-bg">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
		<h2 class="text-sm font-semibold text-text">
			{inReplyTo ? 'Reply' : draftId ? 'Draft' : 'New Message'}
		</h2>
		<div class="flex items-center gap-2">
			{#if importance === 'high'}
				<span class="text-xs text-red-400 font-medium">High importance</span>
			{:else if importance === 'low'}
				<span class="text-xs text-blue-400 font-medium">Low importance</span>
			{/if}
			<button onclick={handleSend} disabled={sending || savingDraft}
				class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed">
				{sending ? 'Sending...' : 'Send'}
			</button>
			<button onclick={handleSaveDraft} disabled={sending || savingDraft}
				class="text-text-secondary hover:text-text text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50">
				{savingDraft ? 'Saving...' : 'Draft'}
			</button>
			<button onclick={handleDiscard} disabled={discarding}
				class="text-text-tertiary hover:text-red-400 text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50">
				{discarding ? 'Discarding...' : 'Discard'}
			</button>
			<button onclick={closeFullCompose}
				class="text-text-tertiary hover:text-text transition-colors cursor-pointer ml-1">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>
	</div>

	<!-- To / Subject -->
	<div class="px-4 pt-2 shrink-0 border-b border-border">
		<div class="flex items-center py-1.5 border-b border-border/50">
			<label class="text-xs text-text-tertiary w-10 shrink-0">To</label>
			<input bind:value={to} type="text" placeholder="recipient@example.com"
				class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
			{#if !showCc}
				<button onclick={() => showCc = true} class="text-xs text-text-tertiary hover:text-text cursor-pointer ml-2">Cc</button>
			{/if}
		</div>
		{#if showCc}
			<div class="flex items-center py-1.5 border-b border-border/50">
				<label class="text-xs text-text-tertiary w-10 shrink-0">Cc</label>
				<input bind:value={cc} type="text" placeholder="cc@example.com"
					class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
			</div>
		{/if}
		<div class="flex items-center py-1.5">
			<label class="text-xs text-text-tertiary w-10 shrink-0">Sub</label>
			<input bind:value={subject} type="text" placeholder="Subject"
				class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
		</div>
	</div>

	<!-- Ribbon -->
	<div class="flex items-start gap-0 border-b border-border bg-surface overflow-x-auto shrink-0">
		<!-- Clipboard -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
			<div class="flex items-center gap-0.5">
				<button type="button" class="fc-btn" onclick={() => document.execCommand('cut')} title="Cut">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
				</button>
				<button type="button" class="fc-btn" onclick={() => document.execCommand('copy')} title="Copy">
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
				</button>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Clipboard</div>
		</div>

		<!-- Basic Text -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
			<div class="flex flex-col gap-0.5">
				<div class="flex items-center gap-0.5">
					<select onchange={(e) => editor?.chain().focus().setFontFamily((e.target as HTMLSelectElement).value).run()} class="fc-select w-24">
						<option value="Calibri, 'Segoe UI', Arial, sans-serif">Calibri</option>
						<option value="Arial, sans-serif">Arial</option>
						<option value="'Times New Roman', serif">Times New Roman</option>
						<option value="'Courier New', monospace">Courier New</option>
						<option value="Georgia, serif">Georgia</option>
						<option value="Verdana, sans-serif">Verdana</option>
					</select>
					<select onchange={(e) => editor?.chain().focus().setMark('textStyle', { fontSize: (e.target as HTMLSelectElement).value + 'px' }).run()} class="fc-select w-12">
						{#each [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48] as size}
							<option value={size}>{size}</option>
						{/each}
					</select>
				</div>
				<div class="flex items-center gap-0.5">
					<button type="button" class="fc-btn {editor?.isActive('bold') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><strong>B</strong></button>
					<button type="button" class="fc-btn {editor?.isActive('italic') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></button>
					<button type="button" class="fc-btn {editor?.isActive('underline') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><u>U</u></button>
					<button type="button" class="fc-btn {editor?.isActive('strike') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></button>
					<button type="button" class="fc-btn {editor?.isActive('highlight') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleHighlight().run()} title="Highlight">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
					</button>
					<label class="fc-btn cursor-pointer" title="Font color">
						<input type="color" class="sr-only" oninput={(e) => editor?.chain().focus().setColor((e.target as HTMLInputElement).value).run()} />
						<span class="text-xs font-bold">A</span>
					</label>
					<button type="button" class="fc-btn {editor?.isActive('subscript') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleSubscript().run()} title="Subscript"><span class="text-[10px]">x₂</span></button>
					<button type="button" class="fc-btn {editor?.isActive('superscript') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleSuperscript().run()} title="Superscript"><span class="text-[10px]">x²</span></button>
				</div>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Basic Text</div>
		</div>

		<!-- Paragraph -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
			<div class="flex flex-col gap-0.5">
				<div class="flex items-center gap-0.5">
					<button type="button" class="fc-btn {editor?.isActive('bulletList') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
					</button>
					<button type="button" class="fc-btn {editor?.isActive('orderedList') ? 'active' : ''}" onclick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
					</button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().liftListItem('listItem').run()} title="Outdent"><span class="text-xs">←</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().sinkListItem('listItem').run()} title="Indent"><span class="text-xs">→</span></button>
					<select onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v === 'normal') editor?.chain().focus().setParagraph().run(); else editor?.chain().focus().setHeading({ level: parseInt(v) as 1|2|3 }).run(); }} class="fc-select w-20">
						<option value="normal">Normal</option>
						<option value="1">Heading 1</option>
						<option value="2">Heading 2</option>
						<option value="3">Heading 3</option>
					</select>
				</div>
				<div class="flex items-center gap-0.5">
					<button type="button" class="fc-btn {editor?.isActive({ textAlign: 'left' }) ? 'active' : ''}" onclick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align left">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
					</button>
					<button type="button" class="fc-btn {editor?.isActive({ textAlign: 'center' }) ? 'active' : ''}" onclick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align center">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
					</button>
					<button type="button" class="fc-btn {editor?.isActive({ textAlign: 'right' }) ? 'active' : ''}" onclick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align right">
						<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
					</button>
				</div>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Paragraph</div>
		</div>

		<!-- Insert -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
			<div class="flex items-center gap-0.5 relative">
				<button type="button" class="fc-btn {editor?.isActive('link') ? 'active' : ''}" onclick={setLink} title="Insert link">
					<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
				</button>
				<div class="relative">
					<button type="button" class="fc-btn" onclick={() => showEmoji = !showEmoji} title="Emoji"><span class="text-sm">😊</span></button>
					{#if showEmoji}
						<div class="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg p-2 grid grid-cols-5 gap-1 shadow-lg">
							{#each EMOJIS as emoji}
								<button type="button" class="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-hover cursor-pointer text-sm" onclick={() => insertEmoji(emoji)}>{emoji}</button>
							{/each}
						</div>
					{/if}
				</div>
				<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">
					<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
				</button>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Insert</div>
		</div>

		<!-- Table (conditional) -->
		{#if editor?.isActive('table')}
			<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
				<div class="flex items-center gap-0.5 flex-wrap">
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().addRowBefore().run()} title="Add row above"><span class="text-[10px]">↑Row</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().addRowAfter().run()} title="Add row below"><span class="text-[10px]">↓Row</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().deleteRow().run()} title="Delete row"><span class="text-[10px]">−Row</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().addColumnBefore().run()} title="Add column left"><span class="text-[10px]">←Col</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().addColumnAfter().run()} title="Add column right"><span class="text-[10px]">→Col</span></button>
					<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().deleteColumn().run()} title="Delete column"><span class="text-[10px]">−Col</span></button>
					<button type="button" class="fc-btn text-red-400" onclick={() => editor?.chain().focus().deleteTable().run()} title="Delete table"><span class="text-[10px]">×Table</span></button>
				</div>
				<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Table</div>
			</div>
		{/if}

		<!-- Importance -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1 border-r border-border">
			<div class="flex items-center gap-0.5">
				<button type="button" class="fc-btn {importance === 'high' ? 'active text-red-400' : ''}" onclick={() => importance = importance === 'high' ? 'normal' : 'high'} title="High importance"><span class="text-sm font-bold">!</span></button>
				<button type="button" class="fc-btn {importance === 'low' ? 'active text-blue-400' : ''}" onclick={() => importance = importance === 'low' ? 'normal' : 'low'} title="Low importance"><span class="text-sm">↓</span></button>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Importance</div>
		</div>

		<!-- Clear -->
		<div class="flex flex-col items-stretch min-w-fit px-2 py-1">
			<div class="flex items-center gap-0.5">
				<button type="button" class="fc-btn" onclick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
					<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/><line x1="4" y1="20" x2="20" y2="4"/></svg>
				</button>
			</div>
			<div class="text-[10px] text-text-tertiary text-center mt-1 select-none">Clear</div>
		</div>
	</div>

	<!-- Error -->
	{#if error}
		<div class="px-4 py-2 shrink-0"><p class="text-xs text-red-400">{error}</p></div>
	{/if}

	<!-- Editor -->
	<div class="flex-1 overflow-y-auto px-4 py-3">
		<div bind:this={editorEl} class="min-h-full outline-none fc-editor"></div>
	</div>
</div>

<style>
	.fc-editor :global(.ProseMirror) {
		outline: none; min-height: 200px;
		font-family: Calibri, 'Segoe UI', Arial, sans-serif;
		font-size: 14px; line-height: 1.6; color: var(--color-text);
	}
	.fc-editor :global(.ProseMirror p) { margin: 0 0 0.5em; }
	.fc-editor :global(.ProseMirror ul) { list-style: disc; padding-left: 1.5em; }
	.fc-editor :global(.ProseMirror ol) { list-style: decimal; padding-left: 1.5em; }
	.fc-editor :global(.ProseMirror a) { color: var(--color-accent); text-decoration: underline; }
	.fc-editor :global(.ProseMirror blockquote) {
		border-left: 3px solid var(--color-border); padding-left: 1em; margin-left: 0; color: var(--color-text-secondary);
	}
	.fc-editor :global(.ProseMirror .is-editor-empty:first-child::before) {
		content: attr(data-placeholder); color: var(--color-text-tertiary); pointer-events: none; float: left; height: 0;
	}
	.fc-editor :global(.ProseMirror table) { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
	.fc-editor :global(.ProseMirror td),
	.fc-editor :global(.ProseMirror th) { border: 1px solid var(--color-border); padding: 0.4em 0.6em; min-width: 1em; }
	.fc-editor :global(.ProseMirror th) { background: var(--color-surface-hover); font-weight: 600; }
</style>
