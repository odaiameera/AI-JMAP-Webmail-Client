<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	import { fetchText } from '$lib/attachments/fetch';

	let { attachment }: { attachment: ViewerAttachment } = $props();

	let content = $state<string | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);

	$effect(() => {
		loading = true;
		content = null;
		error = null;
		fetchText(attachment.emailId, attachment.blobId, attachment.name)
			.then((text) => {
				if (text.length > 5_000_000) {
					content = text.slice(0, 5_000_000) + '\n\n... (truncated, download to see full content)';
				} else {
					content = text;
				}
				loading = false;
			})
			.catch((err) => {
				error = err?.message ?? 'Failed to load';
				loading = false;
			});
	});

	const lowerName = $derived(attachment.name.toLowerCase());
	const isTabular = $derived(lowerName.endsWith('.csv') || lowerName.endsWith('.tsv'));

	const tabularRows = $derived.by<string[][] | null>(() => {
		if (!isTabular || !content) return null;
		const delim = lowerName.endsWith('.tsv') ? '\t' : ',';
		return content.split('\n').slice(0, 500).map((line) => line.split(delim));
	});

	const tabularTotalRows = $derived(content ? content.split('\n').length : 0);
</script>

<div class="w-full h-full overflow-auto p-6">
	{#if loading}
		<div class="flex items-center justify-center h-full text-text-tertiary text-sm">Loading…</div>
	{:else if error}
		<div class="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
	{:else if tabularRows && tabularRows.length > 0}
		<table class="text-sm text-text border-collapse">
			<thead class="sticky top-0 bg-surface">
				<tr>
					{#each tabularRows[0] as cell}
						<th class="border border-border px-3 py-1.5 text-left font-medium">{cell}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each tabularRows.slice(1) as row}
					<tr class="hover:bg-surface-hover">
						{#each row as cell}
							<td class="border border-border px-3 py-1">{cell}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if tabularTotalRows > 500}
			<p class="mt-4 text-xs text-text-tertiary">First 500 rows shown. Download for full file.</p>
		{/if}
	{:else}
		<pre class="text-sm text-text font-mono whitespace-pre-wrap break-all leading-relaxed">{content}</pre>
	{/if}
</div>
