<script lang="ts">
	import type { PageData } from './$types';
	import { openCompose } from '$lib/stores/compose';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();
	const email = $derived(data.email);

	const from = $derived(email.from?.[0]);
	const toList = $derived(email.to ?? []);
	const ccList = $derived(email.cc ?? []);
	const isDraft = $derived('$draft' in email.keywords);
	const isRead = $derived('$seen' in email.keywords);
	const unsubscribeHeader = $derived(email['header:list-unsubscribe:asText'] ?? null);
	const sourceMailboxId = $derived(Object.keys(email.mailboxIds)[0] ?? '');

	let lightMode = $state(false);
	let actionLoading = $state('');

	onMount(() => {
		if (isDraft) {
			openCompose({
				to: email.to?.map((a) => a.email).join(', ') ?? '',
				cc: email.cc?.map((a) => a.email).join(', ') ?? '',
				subject: email.subject ?? '',
				body: getPlainTextBody(),
				draftId: email.id
			});
		}
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getPlainTextBody(): string {
		if (!email.bodyValues) return '';
		if (email.textBody?.length) {
			const partId = email.textBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) return body.value;
		}
		if (email.htmlBody?.length) {
			const partId = email.htmlBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) return body.value.replace(/<[^>]+>/g, '');
		}
		return '';
	}

	function getQuotedBlock(): string {
		const sender = email.from?.[0];
		if (!sender) return '';
		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
		const quotedBody = getPlainTextBody().split('\n').map((line) => `> ${line}`).join('\n');
		return `\n\nOn ${dateStr}, ${fromStr} wrote:\n${quotedBody}`;
	}

	function handleReply() {
		const sender = email.from?.[0];
		if (!sender) return;
		const originalSubject = email.subject ?? '';
		const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
		openCompose({
			to: sender.email,
			cc: '',
			subject: replySubject,
			body: getQuotedBlock(),
			inReplyTo: email.id,
			references: email.id
		});
	}

	function handleReplyAll() {
		const sender = email.from?.[0];
		if (!sender) return;
		const originalSubject = email.subject ?? '';
		const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

		// Decode own email from auth — available via parent layout data
		const ownEmail = sender.email; // fallback; real filtering below
		const allTo = [...(email.to ?? []), ...(email.cc ?? [])];
		// Remove duplicates and the original sender (who goes in To)
		const ccAddresses = allTo
			.filter((a) => a.email !== sender.email)
			.map((a) => a.email)
			.filter((v, i, arr) => arr.indexOf(v) === i)
			.join(', ');

		openCompose({
			to: sender.email,
			cc: ccAddresses,
			subject: replySubject,
			body: getQuotedBlock(),
			inReplyTo: email.id,
			references: email.id
		});
	}

	function handleForward() {
		const sender = email.from?.[0];
		const originalSubject = email.subject ?? '';
		const fwdSubject = originalSubject.startsWith('Fwd:') ? originalSubject : `Fwd: ${originalSubject}`;
		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender?.name ? `${sender.name} <${sender.email}>` : (sender?.email ?? 'Unknown');
		const toStr = toList.map((a) => a.name || a.email).join(', ');

		openCompose({
			to: '',
			cc: '',
			subject: fwdSubject,
			body: `\n\n---------- Forwarded message ----------\nFrom: ${fromStr}\nDate: ${dateStr}\nSubject: ${originalSubject}\nTo: ${toStr}\n\n${getPlainTextBody()}`,
			isForward: true
		});
	}

	async function doAction(action: string) {
		actionLoading = action;
		try {
			await fetch(`/api/email/${email.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, sourceMailboxId })
			});
			if (action === 'trash' || action === 'archive' || action === 'spam') {
				goto('/inbox');
			} else {
				await invalidateAll();
			}
		} finally {
			actionLoading = '';
		}
	}

	function handleUnsubscribe() {
		if (!unsubscribeHeader) return;
		const mailtoMatch = unsubscribeHeader.match(/mailto:([^>,\s]+)/i);
		if (mailtoMatch) {
			openCompose({
				to: mailtoMatch[1],
				cc: '',
				subject: 'Unsubscribe',
				body: 'Unsubscribe'
			});
			return;
		}
		const urlMatch = unsubscribeHeader.match(/https?:\/\/[^>,\s]+/i);
		if (urlMatch) {
			window.open(urlMatch[0], '_blank');
		}
	}

	function getBodyHtml(): string {
		if (!email.bodyValues) return '';
		if (email.htmlBody?.length) {
			const partId = email.htmlBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) return body.value;
		}
		if (email.textBody?.length) {
			const partId = email.textBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) {
				const escaped = body.value
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/\n/g, '<br>');
				return `<pre style="white-space: pre-wrap; font-family: inherit;">${escaped}</pre>`;
			}
		}
		return '<p style="color: #71717A;">No content</p>';
	}
</script>

<svelte:head>
	<title>{email.subject || '(no subject)'} — Webmail</title>
</svelte:head>

<div class="h-full flex flex-col">
	<header class="px-6 py-4 border-b border-border shrink-0">
		<div class="flex items-center justify-between mb-3">
			<a href="/inbox" class="text-text-tertiary hover:text-text transition-colors text-sm">
				&larr; Back
			</a>
		</div>

		<h1 class="text-xl font-semibold text-text mb-3">
			{email.subject || '(no subject)'}
		</h1>

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<div class="flex items-baseline gap-2">
					<span class="font-medium text-text">
						{from?.name || from?.email || 'Unknown'}
					</span>
					{#if from?.name && from?.email}
						<span class="text-xs text-text-tertiary">&lt;{from.email}&gt;</span>
					{/if}
				</div>
				<div class="text-xs text-text-tertiary mt-1">
					<span>To: {toList.map(a => a.name || a.email).join(', ')}</span>
					{#if ccList.length > 0}
						<span class="ml-3">Cc: {ccList.map(a => a.name || a.email).join(', ')}</span>
					{/if}
				</div>
			</div>
			<span class="text-xs text-text-tertiary shrink-0">
				{formatDate(email.receivedAt)}
			</span>
		</div>
	</header>

	<!-- Ribbon -->
	<div class="ribbon flex items-center justify-between px-6 py-2 border-b border-border shrink-0">
		<div class="flex items-center gap-1">
			<button onclick={handleReply} title="Reply"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
			</button>
			<button onclick={handleReplyAll} title="Reply All"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
			</button>
			<button onclick={handleForward} title="Forward"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
			</button>
		</div>

		<div class="flex items-center gap-1">
			<button onclick={() => doAction(isRead ? 'markUnread' : 'markRead')} title={isRead ? 'Mark Unread' : 'Mark Read'}
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				{#if isRead}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
				{/if}
			</button>
			<button onclick={() => doAction('archive')} title="Archive" disabled={actionLoading === 'archive'}
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
			</button>
			<button onclick={() => doAction('spam')} title="Spam" disabled={actionLoading === 'spam'}
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
			</button>
			<button onclick={() => doAction('trash')} title="Trash" disabled={actionLoading === 'trash'}
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
			</button>

			<div class="w-px h-5 bg-border mx-1"></div>

			<button onclick={() => window.print()} title="Print"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
			</button>
			<button onclick={() => lightMode = !lightMode} title={lightMode ? 'Dark Mode' : 'Light Mode'}
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer {lightMode ? 'bg-surface-hover text-accent' : ''}">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
			</button>

			{#if unsubscribeHeader}
				<div class="w-px h-5 bg-border mx-1"></div>
				<button onclick={handleUnsubscribe} title="Unsubscribe"
					class="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer">
					Unsubscribe
				</button>
			{/if}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto px-6 py-4">
		<div class="email-body prose prose-invert max-w-none {lightMode ? 'light-mode' : ''}">
			{@html getBodyHtml()}
		</div>
	</div>
</div>

<style>
	.email-body :global(*) {
		max-width: 100%;
	}
	.email-body :global(img) {
		max-width: 100%;
		height: auto;
	}
	.email-body :global(a) {
		color: var(--color-accent);
	}
	.email-body :global(blockquote) {
		border-left: 3px solid var(--color-border);
		padding-left: 1rem;
		margin-left: 0;
		color: var(--color-text-secondary);
	}
	.email-body.light-mode {
		background: #ffffff;
		color: #1a1a1a;
		padding: 1.5rem;
		border-radius: 0.5rem;
	}
	.email-body.light-mode :global(a) {
		color: #4f46e5;
	}
	.email-body.light-mode :global(blockquote) {
		border-left-color: #d1d5db;
		color: #4b5563;
	}
</style>
