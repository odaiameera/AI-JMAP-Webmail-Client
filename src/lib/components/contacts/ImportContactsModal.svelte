<script lang="ts">
	import type { AddressBook, ContactCard } from '$lib/jmap/types';
	import { apiImportContacts } from '$lib/contacts/api';
	import {
		batchContactImportForms,
		classifyContactImport,
		parseContactImport,
		type ClassifiedContactImport
	} from '$lib/contacts/import';

	const MAX_FILE_SIZE = 5 * 1024 * 1024;
	const MAX_CONTACTS = 2_000;

	let {
		open,
		addressBooks,
		existingContacts,
		onClose,
		onImported
	}: {
		open: boolean;
		addressBooks: AddressBook[];
		existingContacts: ContactCard[];
		onClose: () => void;
		onImported: (result: { imported: number; failed: number }) => void;
	} = $props();

	let selectedAddressBookId = $state('');
	let sourceName = $state('');
	let sourceText = $state('');
	let rows = $state<ClassifiedContactImport[]>([]);
	let warnings = $state<string[]>([]);
	let error = $state('');
	let reading = $state(false);
	let importing = $state(false);
	let result = $state<{ imported: number; failed: number } | null>(null);
	let importFailures = $state<Array<{ sourceIndex: number; error: string }>>([]);
	let previousOpen = false;

	const readyRows = $derived(rows.filter((row) => row.status === 'ready'));
	const duplicateCount = $derived(rows.filter((row) => row.status === 'duplicate').length);
	const invalidCount = $derived(rows.filter((row) => row.status === 'invalid').length);
	const writableAddressBooks = $derived(addressBooks.filter((book) => book.myRights.mayWrite));

	$effect(() => {
		if (open && !previousOpen) {
			selectedAddressBookId = writableAddressBooks.find((book) => book.isDefault)?.id ?? writableAddressBooks[0]?.id ?? '';
			sourceName = '';
			sourceText = '';
			rows = [];
			warnings = [];
			error = '';
			reading = false;
			importing = false;
			result = null;
			importFailures = [];
		}
		previousOpen = open;
	});

	function parseSource() {
		if (!sourceName || !sourceText) return;
		error = '';
		result = null;
		importFailures = [];
		try {
			const parsed = parseContactImport(sourceName, sourceText, selectedAddressBookId);
			if (parsed.contacts.length > MAX_CONTACTS) {
				throw new Error(`This file contains more than ${MAX_CONTACTS.toLocaleString()} contacts.`);
			}
			rows = classifyContactImport(parsed.contacts, existingContacts);
			warnings = parsed.warnings;
		} catch (caught) {
			rows = [];
			warnings = [];
			error = (caught as Error).message || 'Unable to read this contacts file.';
		}
	}

	async function chooseFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		error = '';
		rows = [];
		result = null;
		if (file.size > MAX_FILE_SIZE) {
			error = 'Choose a contacts file smaller than 5 MB.';
			input.value = '';
			return;
		}
		reading = true;
		try {
			sourceName = file.name;
			sourceText = await file.text();
			parseSource();
		} catch {
			error = 'The selected file could not be read.';
		} finally {
			reading = false;
		}
	}

	function changeAddressBook(event: Event) {
		selectedAddressBookId = (event.currentTarget as HTMLSelectElement).value;
		parseSource();
	}

	async function runImport() {
		if (importing || readyRows.length === 0) return;
		importing = true;
		error = '';
		result = null;
		importFailures = [];
		let imported = 0;
		let failed = 0;
		try {
			const batches = batchContactImportForms(readyRows.map((row) => row.form));
			let start = 0;
			for (const batch of batches) {
				const batchRows = readyRows.slice(start, start + batch.length);
				const response = await apiImportContacts(batch);
				imported += response.imported;
				failed += response.failed;
				for (const failure of response.failures) {
					const source = batchRows[failure.index];
					importFailures.push({
						sourceIndex: source?.sourceIndex ?? start + failure.index + 1,
						error: failure.error
					});
				}
				start += batch.length;
			}
			result = { imported, failed };
			onImported(result);
		} catch (caught) {
			error = (caught as Error).message || 'The contact import stopped unexpectedly.';
			if (imported || failed) {
				result = { imported, failed };
				onImported(result);
			}
		} finally {
			importing = false;
		}
	}

	function cancel() {
		if (!importing) onClose();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[75] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 md:p-6"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-contacts-title"
	>
		<div class="w-full max-w-3xl max-h-full rounded-xl bg-surface border border-border shadow-2xl flex flex-col">
			<header class="h-14 shrink-0 px-5 border-b border-border flex items-center justify-between">
				<div>
					<h2 id="import-contacts-title" class="text-lg font-semibold text-text">Import contacts</h2>
					<p class="text-[11px] text-text-tertiary">Apple or Google vCard, or Google Contacts CSV</p>
				</div>
				<button type="button" aria-label="Close import" class="p-2 rounded-lg text-text-tertiary hover:text-text hover:bg-surface-hover cursor-pointer" onclick={cancel}>×</button>
			</header>

			<div class="flex-1 overflow-y-auto p-5 space-y-5">
				<div class="grid sm:grid-cols-2 gap-4">
					<label class="block">
						<span class="block text-sm font-medium text-text mb-1.5">Choose contacts file</span>
						<input
							type="file"
							accept=".vcf,.vcard,.csv,text/vcard,text/csv"
							disabled={reading || importing}
							onchange={chooseFile}
							class="block w-full text-sm text-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-surface-hover file:text-text file:cursor-pointer"
						/>
					</label>
					<label class="block">
						<span class="block text-sm font-medium text-text mb-1.5">Import into</span>
						<select value={selectedAddressBookId} disabled={importing || writableAddressBooks.length === 0} onchange={changeAddressBook} class="w-full h-10 px-3 rounded-lg bg-surface-hover border border-border text-sm text-text outline-none">
							{#each addressBooks as book (book.id)}
								<option value={book.id} disabled={!book.myRights.mayWrite}>{book.name}{book.isDefault ? ' (default)' : ''}</option>
							{/each}
						</select>
					</label>
				</div>

				<p class="text-xs text-text-tertiary">
					The file is parsed in this browser. Only the validated contact fields you approve are sent to your Stalwart account. Maximum 5 MB and 2,000 contacts.
				</p>

				{#if reading}
					<div class="text-sm text-text-secondary" role="status">Reading contacts…</div>
				{/if}
				{#if error}
					<div class="p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert">{error}</div>
				{/if}

				{#if rows.length > 0}
					<div class="flex flex-wrap gap-2 text-xs" aria-label="Import preview summary">
						<span class="px-2.5 py-1 rounded-full bg-success/10 text-success">{readyRows.length} ready</span>
						<span class="px-2.5 py-1 rounded-full bg-warning/10 text-warning">{duplicateCount} duplicate</span>
						<span class="px-2.5 py-1 rounded-full bg-danger/10 text-danger">{invalidCount} rejected</span>
					</div>
					<div class="border border-border rounded-lg overflow-hidden">
						<div class="max-h-72 overflow-y-auto divide-y divide-border">
							{#each rows.slice(0, 200) as row (row.sourceIndex)}
								<div class="px-3 py-2 flex items-start gap-3">
									<span class="mt-0.5 w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide {row.status === 'ready' ? 'text-success' : row.status === 'duplicate' ? 'text-warning' : 'text-danger'}">{row.status}</span>
									<div class="min-w-0 flex-1">
										<p class="text-sm text-text truncate">{row.form.name || row.form.emails[0]?.address || row.form.phones[0]?.number || `Row ${row.sourceIndex}`}</p>
										{#if row.reason}<p class="text-xs text-text-tertiary mt-0.5">{row.reason}</p>{/if}
									</div>
								</div>
							{/each}
						</div>
						{#if rows.length > 200}<div class="px-3 py-2 border-t border-border text-xs text-text-tertiary">Showing the first 200 of {rows.length} rows.</div>{/if}
					</div>
				{/if}

				{#if warnings.length > 0}
					<div class="text-xs text-warning space-y-1">
						{#each warnings.slice(0, 10) as warning}<p>{warning}</p>{/each}
					</div>
				{/if}

				{#if result}
					<div class="p-4 rounded-lg bg-success/10 border border-success/20" role="status" aria-live="polite">
						<p class="text-sm font-medium text-success">Imported {result.imported} {result.imported === 1 ? 'contact' : 'contacts'}</p>
						{#if result.failed > 0}<p class="text-xs text-text-secondary mt-1">{result.failed} {result.failed === 1 ? 'contact was' : 'contacts were'} rejected.</p>{/if}
					</div>
				{/if}

				{#if importFailures.length > 0}
					<div>
						<h3 class="text-sm font-medium text-text mb-2">Import failures</h3>
						<div class="space-y-1 text-xs text-danger">
							{#each importFailures as failure}<p>Row {failure.sourceIndex}: {failure.error}</p>{/each}
						</div>
					</div>
				{/if}
			</div>

			<footer class="shrink-0 px-5 py-4 border-t border-border flex justify-end gap-2">
				<button type="button" disabled={importing} class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover cursor-pointer" onclick={cancel}>{result ? 'Done' : 'Cancel'}</button>
				{#if !result}
					<button
						type="button"
						disabled={importing || readyRows.length === 0}
						aria-label={`Import ${readyRows.length} ${readyRows.length === 1 ? 'contact' : 'contacts'}`}
						class="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 cursor-pointer"
						onclick={runImport}
					>
						{importing ? 'Importing…' : `Import ${readyRows.length}`}
					</button>
				{/if}
			</footer>
		</div>
	</div>
{/if}
