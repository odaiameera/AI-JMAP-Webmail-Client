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
	let draftId = $state<string | undefined>(data?.draftId);
	let showCc = $state(!!data?.cc);
	let sending = $state(false);
	let savingDraft = $state(false);
	let discarding = $state(false);
	let error = $state('');
	let importance = $state<'high' | 'normal' | 'low'>('normal');
	let showEmojiPicker = $state(false);

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

	function isActive(name: string, attrs?: Record<string, unknown>) {
		return editor?.isActive(name, attrs) ?? false;
	}

	function setLink() {
		const url = window.prompt('URL:', editor?.getAttributes('link').href ?? 'https://');
		if (url === null) return;
		if (url === '') editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		else editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	function insertEmoji(emoji: string) {
		editor?.chain().focus().insertContent(emoji).run();
		showEmojiPicker = false;
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
			if (result.ok) closeFullCompose(); else error = result.error ?? 'Failed to send';
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
	<div class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
		<div class="flex items-center gap-2">
			<h2 class="text-sm font-semibold text-text">
				{inReplyTo ? 'Reply' : draftId ? 'Draft' : 'New Message'}
			</h2>
			{#if importance !== 'normal'}
				<span class="text-xs px-1.5 py-0.5 rounded font-medium {importance === 'high' ? 'text-red-400 bg-red-400/10' : 'text-blue-400 bg-blue-400/10'}">
					{importance === 'high' ? 'High importance' : 'Low importance'}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			<button onclick={handleSend} disabled={sending || savingDraft}
				class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed">
				{sending ? 'Sending...' : 'Send'}
			</button>
			<button onclick={handleSaveDraft} disabled={sending || savingDraft}
				class="text-text-secondary hover:text-text text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50">
				{savingDraft ? 'Saving...' : 'Save Draft'}
			</button>
			<button onclick={handleDiscard} disabled={sending || savingDraft || discarding}
				class="text-text-tertiary hover:text-red-400 text-sm px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50">
				{discarding ? 'Discarding...' : 'Discard'}
			</button>
			<div class="w-px h-4 bg-border mx-1"></div>
			<button onclick={closeFullCompose}
				class="text-text-tertiary hover:text-text transition-colors cursor-pointer w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-hover">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>
	</div>

	<!-- Fields -->
	<div class="shrink-0 border-b border-border">
		<div class="flex items-center px-4 py-1.5 border-b border-border/50">
			<span class="text-xs text-text-tertiary w-8 shrink-0">To</span>
			<input bind:value={to} type="text" placeholder="recipient@example.com" class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
			{#if !showCc}<button onclick={() => showCc = true} class="text-xs text-text-tertiary hover:text-text cursor-pointer">Cc</button>{/if}
		</div>
		{#if showCc}
			<div class="flex items-center px-4 py-1.5 border-b border-border/50">
				<span class="text-xs text-text-tertiary w-8 shrink-0">Cc</span>
				<input bind:value={cc} type="text" placeholder="cc@example.com" class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
			</div>
		{/if}
		<div class="flex items-center px-4 py-1.5">
			<span class="text-xs text-text-tertiary w-8 shrink-0">Sub</span>
			<input bind:value={subject} type="text" placeholder="Subject" class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary" />
		</div>
	</div>

	<!-- Ribbon -->
	<div class="shrink-0 border-b border-border bg-surface px-3 pt-2 pb-1">
		<!-- Row 1: Text formatting -->
		<div class="flex items-center gap-1 mb-1">
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
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
			</button>
			<label class="fc-btn cursor-pointer" title="Font color">
				<input type="color" class="sr-only" oninput={(e) => editor?.chain().focus().setColor((e.target as HTMLInputElement).value).run()} />
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M8 16L12 4l4 12M9.5 12h5"/></svg>
			</label>
			<div class="fc-sep"></div>
			<button type="button" onclick={() => editor?.chain().focus().toggleSubscript().run()} class="fc-btn {isActive('subscript') ? 'fc-active' : ''}" title="Subscript">x<sub>2</sub></button>
			<button type="button" onclick={() => editor?.chain().focus().toggleSuperscript().run()} class="fc-btn {isActive('superscript') ? 'fc-active' : ''}" title="Superscript">x<sup>2</sup></button>
			<div class="fc-sep"></div>
			<button type="button" onclick={() => importance = importance === 'high' ? 'normal' : 'high'} class="fc-btn {importance === 'high' ? 'fc-active-red' : ''}" title="High importance">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
			</button>
			<button type="button" onclick={() => importance = importance === 'low' ? 'normal' : 'low'} class="fc-btn {importance === 'low' ? 'fc-active-blue' : ''}" title="Low importance">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
			</button>
		</div>

		<!-- Row 2: Paragraph + Insert -->
		<div class="flex items-center gap-1">
			<button type="button" onclick={() => editor?.chain().focus().toggleBulletList().run()} class="fc-btn {isActive('bulletList') ? 'fc-active' : ''}" title="Bullet list">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
			</button>
			<button type="button" onclick={() => editor?.chain().focus().toggleOrderedList().run()} class="fc-btn {isActive('orderedList') ? 'fc-active' : ''}" title="Numbered list">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
			</button>
			<button type="button" onclick={() => editor?.chain().focus().sinkListItem('listItem').run()} class="fc-btn" title="Indent">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><polyline points="3 9 7 12 3 15"/></svg>
			</button>
			<button type="button" onclick={() => editor?.chain().focus().liftListItem('listItem').run()} class="fc-btn" title="Outdent">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><polyline points="7 9 3 12 7 15"/></svg>
			</button>
			<div class="fc-sep"></div>
			<button type="button" onclick={() => editor?.chain().focus().setTextAlign('left').run()} class="fc-btn {isActive('', {textAlign:'left'}) ? 'fc-active' : ''}" title="Align left">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
			</button>
			<button type="button" onclick={() => editor?.chain().focus().setTextAlign('center').run()} class="fc-btn {isActive('', {textAlign:'center'}) ? 'fc-active' : ''}" title="Align center">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
			</button>
			<button type="button" onclick={() => editor?.chain().focus().setTextAlign('right').run()} class="fc-btn {isActive('', {textAlign:'right'}) ? 'fc-active' : ''}" title="Align right">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
			</button>
			<select onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v === 'p') editor?.chain().focus().setParagraph().run(); else editor?.chain().focus().setHeading({ level: parseInt(v) as 1|2|3 }).run(); }} class="fc-select w-[100px] ml-1">
				<option value="p">Normal</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
			</select>
			<div class="fc-sep"></div>
			<button type="button" onclick={setLink} class="fc-btn {isActive('link') ? 'fc-active' : ''}" title="Insert link">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
			</button>
			<div class="relative">
				<button type="button" onclick={() => showEmojiPicker = !showEmojiPicker} class="fc-btn {showEmojiPicker ? 'fc-active' : ''}" title="Insert emoji">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
				</button>
				{#if showEmojiPicker}
					<div class="absolute bottom-8 left-0 z-50 bg-surface border border-border rounded-lg p-2 grid grid-cols-5 gap-1 shadow-lg">
						{#each EMOJIS as emoji}<button type="button" onclick={() => insertEmoji(emoji)} class="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-surface-hover cursor-pointer">{emoji}</button>{/each}
					</div>
				{/if}
			</div>
			<button type="button" onclick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} class="fc-btn" title="Insert 3x3 table">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
			</button>
			<div class="fc-sep"></div>
			<button type="button" onclick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} class="fc-btn" title="Clear formatting">
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 5H9l-7 7 7 7h11a2 2 0 002-2V7a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
			</button>
			{#if isActive('table')}
				<div class="fc-sep"></div>
				<button type="button" onclick={() => editor?.chain().focus().addRowAfter().run()} class="fc-btn" title="Add row">+Row</button>
				<button type="button" onclick={() => editor?.chain().focus().deleteRow().run()} class="fc-btn" title="Delete row">−Row</button>
				<button type="button" onclick={() => editor?.chain().focus().addColumnAfter().run()} class="fc-btn" title="Add column">+Col</button>
				<button type="button" onclick={() => editor?.chain().focus().deleteColumn().run()} class="fc-btn" title="Delete column">−Col</button>
				<button type="button" onclick={() => editor?.chain().focus().deleteTable().run()} class="fc-btn text-red-400" title="Delete table">×Table</button>
			{/if}
		</div>
	</div>

	<!-- Error -->
	{#if error}
		<div class="px-4 py-2 bg-red-500/10 border-b border-red-500/20 shrink-0"><p class="text-xs text-red-400">{error}</p></div>
	{/if}

	<!-- Editor -->
	<div class="flex-1 overflow-y-auto px-5 py-4">
		<div bind:this={editorEl} class="min-h-full full-composer-editor"></div>
	</div>
</div>
