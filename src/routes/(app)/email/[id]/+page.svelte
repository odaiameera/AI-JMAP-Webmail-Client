<script lang="ts">
	import type { PageData } from './$types';
	import { openCompose } from '$lib/stores/compose';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();
	const email = $derived(data.email);

	const from = $derived(email.from?.[0]);
	const toList = $derived(email.to ?? []);
	const ccList = $derived(email.cc ?? []);
	const isDraft = $derived('$draft' in email.keywords);

	onMount(() => {
		if (isDraft) {
			openCompose({
				to: email.to?.map((a) => a.email).join(', ') ?? '',
				cc: email.cc?.map((a) => a.email).join(', ') ?? '',
				subject: email.subject ?? '',
				body: getPlainTextBody()
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

	function handleReply() {
		const sender = email.from?.[0];
		if (!sender) return;

		const originalSubject = email.subject ?? '';
		const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;

		const quotedBody = getPlainTextBody()
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');

		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender.name ? `${sender.name} <${sender.email}>` : sender.email;

		openCompose({
			to: sender.email,
			cc: '',
			subject: replySubject,
			body: `\n\nOn ${dateStr}, ${fromStr} wrote:\n${quotedBody}`,
			inReplyTo: email.id,
			references: email.id
		});
	}

	function getBodyHtml(): string {
		if (!email.bodyValues) return '';

		// Try HTML body first
		if (email.htmlBody?.length) {
			const partId = email.htmlBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) return body.value;
		}

		// Fall back to text body
		if (email.textBody?.length) {
			const partId = email.textBody[0].partId;
			const body = email.bodyValues[partId];
			if (body) {
				// Convert plain text to HTML
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
			<a
				href="/inbox"
				class="text-text-tertiary hover:text-text transition-colors text-sm"
			>
				&larr; Back
			</a>
			<button
				onclick={handleReply}
				class="bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium rounded-lg
					px-3 py-1.5 transition-colors cursor-pointer"
			>
				Reply
			</button>
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

	<div class="flex-1 overflow-y-auto px-6 py-4">
		<div class="email-body prose prose-invert max-w-none">
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
</style>
