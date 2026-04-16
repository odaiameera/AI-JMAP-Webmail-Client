<script lang="ts">
	import type { Email } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { openCompose } from '$lib/stores/compose';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, getContext } from 'svelte';

	const allLabels = getContext<Label[]>('labels') ?? [];

	let { email, compact = false }: { email: Email; compact?: boolean } = $props();

	const from = $derived(email.from?.[0]);
	const toList = $derived(email.to ?? []);
	const ccList = $derived(email.cc ?? []);
	const isDraft = $derived('$draft' in email.keywords);
	const isRead = $derived('$seen' in email.keywords);
	const unsubscribeHeader = $derived(email['header:list-unsubscribe:asText'] ?? null);
	// Label ids are also mailbox ids now; skip them when picking a source
	// mailbox for move-style actions (archive/trash/spam) so we don't
	// accidentally treat a label as the email's home folder.
	const labelIdSet = $derived(new Set(allLabels.map((l) => l.id)));
	const sourceMailboxId = $derived(
		Object.keys(email.mailboxIds).find((id) => !labelIdSet.has(id)) ?? ''
	);

	let actionLoading = $state('');
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let iframeHeight = $state(400);
	let showLabelMenu = $state(false);

	const appliedLabels = $derived(allLabels.filter((l) => email.mailboxIds[l.id] === true));

	async function toggleLabel(labelId: string) {
		const isApplied = email.mailboxIds[labelId] === true;
		const action = isApplied ? 'remove' : 'apply';
		await fetch(`/api/email/${email.id}/label`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ labelId, action })
		});
		if (isApplied) {
			delete email.mailboxIds[labelId];
		} else {
			email.mailboxIds[labelId] = true;
		}
		showLabelMenu = false;
	}

	const iframeContent = $derived(`<!DOCTYPE html><html><head>
		<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
		<base target="_blank">
		<style>
			body { margin: 16px; font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; word-wrap: break-word; overflow-wrap: break-word; color: #1a1a1a; background: #fff; }
			img { max-width: 100%; height: auto; }
			a { color: #6366F1; }
			pre { white-space: pre-wrap; }
			blockquote { border-left: 3px solid #6366F1; padding-left: 1em; margin-left: 0; color: #71717A; }
		</style>
	</head><body>${getBodyHtml()}</body></html>`);

	function handleIframeLoad() {
		if (!iframeEl?.contentDocument?.body) return;
		iframeHeight = Math.max(200, iframeEl.contentDocument.body.scrollHeight + 32);
	}

	onMount(() => {
		if (isDraft) {
			openCompose({
				to: email.to?.map((a) => a.email).join(', ') ?? '',
				cc: email.cc?.map((a) => a.email).join(', ') ?? '',
				subject: email.subject ?? '',
				body: getBodyHtml(),
				draftId: email.id
			});
		}

		if (!email.keywords['$seen']) {
			const timer = setTimeout(async () => {
				await fetch(`/api/email/${email.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'markRead' })
				});
				invalidateAll();
			}, 1000);
			return () => clearTimeout(timer);
		}
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-US', {
			weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
		});
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
				const escaped = body.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
				return `<pre style="white-space: pre-wrap; font-family: inherit;">${escaped}</pre>`;
			}
		}
		return '<p style="color: #71717A;">No content</p>';
	}

	function getHtmlQuotedBlock(): string {
		const sender = email.from?.[0];
		if (!sender) return '';
		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender.name ? `${sender.name} &lt;${sender.email}&gt;` : sender.email;
		const originalBody = getBodyHtml();
		return `<br><br><blockquote style="margin: 0 0 0 0.8ex; border-left: 3px solid #6366F1; padding-left: 1ex; color: #71717A;"><div><strong>From:</strong> ${fromStr}</div><div><strong>Date:</strong> ${dateStr}</div><div><strong>Subject:</strong> ${email.subject ?? ''}</div><br>${originalBody}</blockquote>`;
	}

	function handleReply() {
		const sender = email.from?.[0];
		if (!sender) return;
		const originalSubject = email.subject ?? '';
		const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
		openCompose({
			to: sender.email, cc: '', subject: replySubject,
			body: getHtmlQuotedBlock(), inReplyTo: email.id, references: email.id
		});
	}

	function handleReplyAll() {
		const sender = email.from?.[0];
		if (!sender) return;
		const originalSubject = email.subject ?? '';
		const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
		const allTo = [...(email.to ?? []), ...(email.cc ?? [])];
		const ccAddresses = allTo
			.filter((a) => a.email !== sender.email)
			.map((a) => a.email)
			.filter((v, i, arr) => arr.indexOf(v) === i)
			.join(', ');
		openCompose({
			to: sender.email, cc: ccAddresses, subject: replySubject,
			body: getHtmlQuotedBlock(), inReplyTo: email.id, references: email.id
		});
	}

	function handleForward() {
		const sender = email.from?.[0];
		const originalSubject = email.subject ?? '';
		const fwdSubject = originalSubject.startsWith('Fwd:') ? originalSubject : `Fwd: ${originalSubject}`;
		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender?.name ? `${sender.name} &lt;${sender.email}&gt;` : (sender?.email ?? 'Unknown');
		const toStr = toList.map((a) => a.name || a.email).join(', ');
		openCompose({
			to: '', cc: '', subject: fwdSubject, isForward: true,
			body: `<br><br><div style="border-top: 1px solid #ccc; padding-top: 1em; color: #71717A;"><div><strong>---------- Forwarded message ----------</strong></div><div><strong>From:</strong> ${fromStr}</div><div><strong>Date:</strong> ${dateStr}</div><div><strong>Subject:</strong> ${originalSubject}</div><div><strong>To:</strong> ${toStr}</div><br>${getBodyHtml()}</div>`
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
		} finally { actionLoading = ''; }
	}

	function handleUnsubscribe() {
		if (!unsubscribeHeader) return;
		const mailtoMatch = unsubscribeHeader.match(/mailto:([^>,\s]+)/i);
		if (mailtoMatch) {
			openCompose({ to: mailtoMatch[1], cc: '', subject: 'Unsubscribe', body: 'Unsubscribe' });
			return;
		}
		const urlMatch = unsubscribeHeader.match(/https?:\/\/[^>,\s]+/i);
		if (urlMatch) window.open(urlMatch[0], '_blank');
	}
</script>

<div class="h-full flex flex-col">
	<header class="{compact ? 'px-4 py-3' : 'px-6 py-4'} border-b border-border shrink-0">
		{#if !compact}
			<div class="flex items-center justify-between mb-3">
				<a href="/inbox" class="text-text-tertiary hover:text-text transition-colors text-sm">&larr; Back</a>
			</div>
		{/if}

		<h1 class="{compact ? 'text-base' : 'text-xl'} font-semibold text-text mb-1">
			{email.subject || '(no subject)'}
		</h1>

		<!-- Labels -->
		<div class="flex items-center gap-1.5 flex-wrap mb-2 relative">
			{#each appliedLabels as label}
				<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
					style="background-color: {label.color}25; color: {label.color};">
					<span class="w-1.5 h-1.5 rounded-full" style="background-color: {label.color}"></span>
					{label.name}
					<button onclick={() => toggleLabel(label.id)} class="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer">&times;</button>
				</span>
			{/each}
			<button onclick={() => showLabelMenu = !showLabelMenu}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-text-tertiary border border-border hover:border-text-tertiary transition-colors cursor-pointer">
				+ Label
			</button>
			{#if showLabelMenu}
				<div class="absolute z-20 top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
					{#each allLabels as label}
						<button onclick={() => toggleLabel(label.id)}
							class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-hover transition-colors cursor-pointer">
							<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {label.color}"></span>
							<span class="flex-1 text-left text-text">{label.name}</span>
							{#if appliedLabels.find(l => l.id === label.id)}
								<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
							{/if}
						</button>
					{/each}
					{#if allLabels.length === 0}
						<p class="px-3 py-2 text-xs text-text-tertiary">No labels yet. Create one in Settings.</p>
					{/if}
				</div>
			{/if}
		</div>

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<div class="flex items-baseline gap-2">
					<span class="font-medium text-text text-sm">{from?.name || from?.email || 'Unknown'}</span>
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
			<span class="text-xs text-text-tertiary shrink-0">{formatDate(email.receivedAt)}</span>
		</div>
	</header>

	<!-- Ribbon -->
	<div class="ribbon flex items-center justify-between {compact ? 'px-4' : 'px-6'} py-2 border-b border-border shrink-0">
		<div class="flex items-center gap-1">
			<button onclick={handleReply} title="Reply" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
			</button>
			<button onclick={handleReplyAll} title="Reply All" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
			</button>
			<button onclick={handleForward} title="Forward" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
			</button>
		</div>
		<div class="flex items-center gap-1">
			<button onclick={() => doAction(isRead ? 'markUnread' : 'markRead')} title={isRead ? 'Mark Unread' : 'Mark Read'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				{#if isRead}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
				{/if}
			</button>
			<button onclick={() => doAction('archive')} title="Archive" disabled={actionLoading === 'archive'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
			</button>
			<button onclick={() => doAction('spam')} title="Spam" disabled={actionLoading === 'spam'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
			</button>
			<button onclick={() => doAction('trash')} title="Trash" disabled={actionLoading === 'trash'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
			</button>
			<div class="w-px h-4 bg-border mx-0.5"></div>
			<button onclick={() => window.print()} title="Print" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
			</button>
			{#if unsubscribeHeader}
				<div class="w-px h-4 bg-border mx-0.5"></div>
				<button onclick={handleUnsubscribe} title="Unsubscribe" class="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer">Unsubscribe</button>
			{/if}
		</div>
	</div>

	<!-- Email body in sandboxed iframe -->
	<div class="flex-1 overflow-y-auto {compact ? 'px-4 py-3' : 'px-6 py-4'}">
		<iframe
			bind:this={iframeEl}
			srcdoc={iframeContent}
			sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
			title="Email content"
			class="w-full border-none rounded"
			style="min-height: 200px; height: {iframeHeight}px;"
			onload={handleIframeLoad}
		></iframe>
	</div>
</div>
