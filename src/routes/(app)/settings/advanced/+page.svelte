<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let importing = $state(false);
	let importResult = $state<{ ok: boolean; message: string } | null>(null);
	let resetting = $state(false);
	let fileInput = $state<HTMLInputElement | undefined>(undefined);

	async function exportPrefs() {
		// Use the GET endpoint directly — it sends back a downloadable JSON blob.
		const res = await fetch('/api/preferences/export');
		if (!res.ok) return;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'ameera-preferences.json';
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importing = true;
		importResult = null;
		try {
			const text = await file.text();
			const payload = JSON.parse(text);
			const res = await fetch('/api/preferences/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok) {
				importResult = { ok: true, message: `Imported ${data.imported ?? 0} preferences.` };
				await invalidateAll();
			} else {
				importResult = { ok: false, message: data.error ?? `HTTP ${res.status}` };
			}
		} catch (err) {
			importResult = { ok: false, message: err instanceof Error ? err.message : 'Invalid file' };
		} finally {
			importing = false;
			(e.target as HTMLInputElement).value = '';
		}
	}

	async function resetAll() {
		if (!confirm('Reset every preference to its default? Your mail is untouched but every setting on this page set will be cleared.')) return;
		resetting = true;
		try {
			await fetch('/api/preferences/reset', { method: 'POST' });
			await invalidateAll();
			goto('/settings/account');
		} finally {
			resetting = false;
		}
	}
</script>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Advanced</h1>
	<p class="text-sm text-text-tertiary mt-1">Back up your preferences, restore them, or reset everything to defaults.</p>
</header>

<section class="space-y-6">
	<div class="rounded-xl border border-border bg-surface-hover/40 p-4 flex items-start gap-4">
		<div class="flex-1">
			<p class="text-sm font-medium text-text">Export preferences</p>
			<p class="text-xs text-text-tertiary mt-1">
				Download a JSON file of every setting on this page set (theme, signature, rules metadata,
				label colors, folder expand state, etc.). Mail and labels themselves live server-side and
				aren't exported.
			</p>
		</div>
		<button
			onclick={exportPrefs}
			class="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer shrink-0"
		>
			Export
		</button>
	</div>

	<div class="rounded-xl border border-border bg-surface-hover/40 p-4 flex items-start gap-4">
		<div class="flex-1">
			<p class="text-sm font-medium text-text">Import preferences</p>
			<p class="text-xs text-text-tertiary mt-1">
				Load a JSON file from a previous export. Only known preference keys are accepted — unknown
				or mis-typed fields are ignored so a bad file can't break anything.
			</p>
			{#if importResult}
				<p class="text-xs mt-2 {importResult.ok ? 'text-accent' : 'text-red-400'}">{importResult.message}</p>
			{/if}
		</div>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="hidden"
			onchange={handleImportFile}
		/>
		<button
			onclick={() => fileInput?.click()}
			disabled={importing}
			class="text-sm border border-border hover:border-text-tertiary text-text-secondary hover:text-text px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
		>
			{importing ? 'Importing…' : 'Choose file…'}
		</button>
	</div>

	<div class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-4">
		<div class="flex-1">
			<p class="text-sm font-medium text-red-400">Reset all preferences</p>
			<p class="text-xs text-text-tertiary mt-1">
				Clear every cookie this app writes. Sign-in and server-side mail are untouched — rules
				and labels as stored in JMAP persist — but UI preferences revert to defaults.
			</p>
		</div>
		<button
			onclick={resetAll}
			disabled={resetting}
			class="text-sm bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
		>
			{resetting ? 'Resetting…' : 'Reset'}
		</button>
	</div>
</section>
