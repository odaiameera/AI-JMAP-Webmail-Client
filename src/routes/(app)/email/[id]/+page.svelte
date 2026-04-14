<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const email = $derived(data.email);

	const from = $derived(email.from?.[0]);
	const toList = $derived(email.to ?? []);
	const ccList = $derived(email.cc ?? []);

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
		<div class="flex items-center gap-3 mb-3">
			<a
				href="/inbox"
				class="text-text-tertiary hover:text-text transition-colors text-sm"
			>
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
