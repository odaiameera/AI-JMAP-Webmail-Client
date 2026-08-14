<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	import { fetchArrayBuffer } from '$lib/attachments/fetch';

	let { attachment }: { attachment: ViewerAttachment } = $props();

	type CellValue = string | number | boolean | null;

	interface Sheet {
		name: string;
		rows: CellValue[][];
		rowCount: number;
		colCount: number;
	}

	let sheets = $state<Sheet[]>([]);
	let activeSheet = $state(0);
	let error = $state<string | null>(null);
	let loading = $state(true);

	const MAX_ROWS_PER_SHEET = 1000;
	const MAX_COLS = 50;

	$effect(() => {
		loading = true;
		sheets = [];
		activeSheet = 0;
		error = null;

		(async () => {
			try {
				const [XLSX, buffer] = await Promise.all([
					import('xlsx'),
					fetchArrayBuffer(attachment.emailId, attachment.blobId, attachment.name)
				]);

				const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

				sheets = wb.SheetNames.map((name) => {
					const ws = wb.Sheets[name];
					const allRows = XLSX.utils.sheet_to_json<CellValue[]>(
						ws, { header: 1, defval: null, raw: false }
					);
					const truncatedRows = allRows.slice(0, MAX_ROWS_PER_SHEET).map((r) =>
						Array.isArray(r) ? r.slice(0, MAX_COLS) : []
					);
					return {
						name,
						rows: truncatedRows,
						rowCount: allRows.length,
						colCount: Math.max(...allRows.map((r) => Array.isArray(r) ? r.length : 0), 0)
					};
				});

				loading = false;
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to render spreadsheet';
				loading = false;
			}
		})();
	});

	function colLabel(idx: number): string {
		let label = '';
		let n = idx;
		while (n >= 0) {
			label = String.fromCharCode(65 + (n % 26)) + label;
			n = Math.floor(n / 26) - 1;
		}
		return label;
	}
</script>

<div class="w-full h-full flex flex-col">
	{#if loading}
		<div class="flex items-center justify-center h-full text-text-tertiary text-sm">Rendering spreadsheet…</div>
	{:else if error}
		<div class="flex items-center justify-center h-full text-danger text-sm">{error}</div>
	{:else if sheets.length === 0}
		<div class="flex items-center justify-center h-full text-text-tertiary text-sm">Empty workbook</div>
	{:else}
		{@const sheet = sheets[activeSheet]}
		{#if sheets.length > 1}
			<div class="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-surface shrink-0 overflow-x-auto">
				{#each sheets as s, i}
					<button
						onclick={() => (activeSheet = i)}
						class="px-3 py-1 text-xs rounded whitespace-nowrap transition-colors cursor-pointer
							{activeSheet === i ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:text-text hover:bg-surface-hover'}"
					>
						{s.name}
					</button>
				{/each}
			</div>
		{/if}

		<div class="flex-1 overflow-auto bg-white">
			{#if sheet.rows.length === 0 || sheet.colCount === 0}
				<div class="flex items-center justify-center h-full text-zinc-500 text-sm">Empty sheet</div>
			{:else}
				<table class="text-sm text-zinc-900 border-collapse">
					<thead class="sticky top-0 bg-zinc-100 text-zinc-600">
						<tr>
							<th class="border border-zinc-300 px-2 py-1 text-xs w-10 sticky left-0 bg-zinc-100">#</th>
							{#each Array(sheet.colCount) as _, idx}
								<th class="border border-zinc-300 px-3 py-1 text-xs font-medium text-left">{colLabel(idx)}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sheet.rows as row, rowIdx}
							<tr class="hover:bg-zinc-50">
								<td class="border border-zinc-300 px-2 py-1 text-xs text-zinc-500 text-center sticky left-0 bg-zinc-100">{rowIdx + 1}</td>
								{#each Array(sheet.colCount) as _, colIdx}
									{@const cell = row[colIdx]}
									<td class="border border-zinc-300 px-3 py-1 tabular-nums whitespace-nowrap">
										{cell ?? ''}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				{#if sheet.rowCount > MAX_ROWS_PER_SHEET}
					<p class="p-4 text-xs text-zinc-500">
						Showing {MAX_ROWS_PER_SHEET} of {sheet.rowCount} rows. Download for full file.
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>
