<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import TextAlign from '@tiptap/extension-text-align';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';

	let { value = $bindable(''), placeholder = 'Write your message...' }:
		{ value?: string; placeholder?: string } = $props();

	let element: HTMLDivElement;
	let editor: Editor | null = $state(null);

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit,
				Underline,
				TextAlign.configure({ types: ['heading', 'paragraph'] }),
				Link.configure({ openOnClick: false }),
				Placeholder.configure({ placeholder })
			],
			content: value,
			onTransaction: () => { editor = editor; },
			onUpdate: ({ editor: e }) => { value = e.getHTML(); }
		});
	});

	onDestroy(() => editor?.destroy());

	function cmd(action: () => void) { action(); editor?.view.focus(); }

	function setLink() {
		const url = window.prompt('URL:', editor?.getAttributes('link').href ?? 'https://');
		if (url === null) return;
		if (url === '') {
			editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		} else {
			editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		}
	}
</script>

<div class="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border shrink-0">
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleBold().run())}
		class="toolbar-btn {editor?.isActive('bold') ? 'active' : ''}" title="Bold"><strong>B</strong></button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleItalic().run())}
		class="toolbar-btn {editor?.isActive('italic') ? 'active' : ''}" title="Italic"><em>I</em></button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleUnderline().run())}
		class="toolbar-btn {editor?.isActive('underline') ? 'active' : ''}" title="Underline"><u>U</u></button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleStrike().run())}
		class="toolbar-btn {editor?.isActive('strike') ? 'active' : ''}" title="Strikethrough"><s>S</s></button>

	<div class="toolbar-sep"></div>

	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleBulletList().run())}
		class="toolbar-btn {editor?.isActive('bulletList') ? 'active' : ''}" title="Bullet list">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
	</button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().toggleOrderedList().run())}
		class="toolbar-btn {editor?.isActive('orderedList') ? 'active' : ''}" title="Numbered list">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
	</button>

	<div class="toolbar-sep"></div>

	<button type="button" onclick={() => cmd(() => editor?.chain().focus().setTextAlign('left').run())}
		class="toolbar-btn {editor?.isActive({ textAlign: 'left' }) ? 'active' : ''}" title="Align left">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
	</button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().setTextAlign('center').run())}
		class="toolbar-btn {editor?.isActive({ textAlign: 'center' }) ? 'active' : ''}" title="Align center">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
	</button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().setTextAlign('right').run())}
		class="toolbar-btn {editor?.isActive({ textAlign: 'right' }) ? 'active' : ''}" title="Align right">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
	</button>

	<div class="toolbar-sep"></div>

	<button type="button" onclick={setLink}
		class="toolbar-btn {editor?.isActive('link') ? 'active' : ''}" title="Insert link">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
	</button>
	<button type="button" onclick={() => cmd(() => editor?.chain().focus().clearNodes().unsetAllMarks().run())}
		class="toolbar-btn" title="Clear formatting">
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="4" y1="4" x2="20" y2="20"/><line x1="4" y1="20" x2="20" y2="4"/></svg>
	</button>
</div>

<div bind:this={element} class="flex-1 overflow-y-auto px-4 py-2 min-h-0 prose-editor"></div>

<style>
	.toolbar-btn {
		display: flex; align-items: center; justify-content: center;
		width: 26px; height: 26px; border-radius: 4px; font-size: var(--text-xs);
		color: var(--color-text-secondary); cursor: pointer;
		transition: background 0.1s, color 0.1s;
		border: none; background: transparent;
	}
	.toolbar-btn:hover { background: var(--color-surface-hover); color: var(--color-text); }
	.toolbar-btn.active { background: color-mix(in srgb, var(--color-accent) 15%, transparent); color: var(--color-accent); }
	.toolbar-sep { width: 1px; height: 16px; background: var(--color-border); margin: 0 4px; }

	.prose-editor :global(.ProseMirror) {
		outline: none; min-height: 140px;
		/* Calibri at 14px is what the recipient sees, so this deliberately
		   sits outside the app's type scale — the compose view has to show the
		   message at its real size, not at the app's. */
		font-family: Calibri, 'Segoe UI', Arial, sans-serif;
		font-size: 14px; line-height: 1.6; color: var(--color-text);
	}
	.prose-editor :global(.ProseMirror p) { margin: 0 0 0.5em; }
	.prose-editor :global(.ProseMirror ul) { list-style: disc; padding-left: 1.5em; }
	.prose-editor :global(.ProseMirror ol) { list-style: decimal; padding-left: 1.5em; }
	.prose-editor :global(.ProseMirror a) { color: var(--color-accent); text-decoration: underline; }
	.prose-editor :global(.ProseMirror blockquote) {
		border-left: 3px solid var(--color-border); padding-left: 1em; margin-left: 0; color: var(--color-text-secondary);
	}
	.prose-editor :global(.ProseMirror .is-editor-empty:first-child::before) {
		content: attr(data-placeholder); color: var(--color-text-tertiary); pointer-events: none; float: left; height: 0;
	}
</style>
