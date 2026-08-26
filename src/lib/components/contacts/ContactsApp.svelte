<script lang="ts">
	import { onMount } from 'svelte';
	import { pageTitle } from '$lib/utils/title';
	import { openCompose } from '$lib/stores/compose';
	import {
		apiCreateContact,
		apiDeleteContact,
		apiLoadContacts,
		apiUpdateContact,
		type ContactsLoadResponse
	} from '$lib/contacts/api';
	import {
		contactDisplayName,
		contactEmails,
		contactPhones,
		contactPrimaryEmail,
		groupContactsAlphabetically,
		type ContactFormValue
	} from '$lib/contacts/model';
	import type { ContactCard } from '$lib/jmap/types';
	import { takePendingContact } from '$lib/contacts/navigation';
	import ContactFormModal from './ContactFormModal.svelte';
	import ImportContactsModal from './ImportContactsModal.svelte';

	let loading = $state(true);
	let error = $state('');
	let data = $state<ContactsLoadResponse | null>(null);
	let selectedId = $state<string | null>(null);
	let query = $state('');
	let requestController: AbortController | null = null;
	let formOpen = $state(false);
	let createInitial = $state<Partial<ContactFormValue> | null>(null);
	let importOpen = $state(false);
	let openingImport = $state(false);
	let importExistingContacts = $state<ContactCard[]>([]);
	let editingContact = $state<ContactCard | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');

	const contacts = $derived(data?.contacts ?? []);
	const groups = $derived(groupContactsAlphabetically(contacts));
	const selected = $derived(contacts.find((contact) => contact.id === selectedId) ?? null);
	const canMutate = $derived(
		data?.supported === true && data.addressBooks.some((book) => book.myRights.mayWrite)
	);
	const canMutateSelected = $derived.by(() => {
		if (!canMutate || !selected || !data?.supported) return false;
		const selectedBookIds = Object.entries(selected.addressBookIds)
			.filter(([, included]) => included)
			.map(([id]) => id);
		const writableBookIds = new Set(
			data.addressBooks.filter((book) => book.myRights.mayWrite).map((book) => book.id)
		);
		return selectedBookIds.length > 0 && selectedBookIds.every((id) => writableBookIds.has(id));
	});

	async function loadContacts(search = query) {
		requestController?.abort();
		requestController = new AbortController();
		loading = true;
		error = '';
		try {
			const result = await apiLoadContacts(search, { signal: requestController.signal });
			data = result;
			if (selectedId && !result.contacts.some((contact) => contact.id === selectedId)) {
				selectedId = null;
			}
			if (!selectedId && result.contacts.length > 0) selectedId = result.contacts[0].id;
		} catch (caught) {
			if ((caught as Error).name !== 'AbortError') {
				error = (caught as Error).message || 'Unable to load contacts';
			}
		} finally {
			loading = false;
		}
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		loadContacts(query);
	}

	function openCreate(initial: Partial<ContactFormValue> | null = null) {
		editingContact = null;
		createInitial = initial;
		formOpen = true;
	}

	function openEdit() {
		if (!selected || !canMutateSelected) return;
		createInitial = null;
		editingContact = selected;
		formOpen = true;
	}

	async function openImport() {
		if (!canMutate || openingImport) return;
		openingImport = true;
		error = '';
		try {
			const result = await apiLoadContacts('');
			if (!result.supported) {
				error = 'Contacts are no longer available for this account.';
				return;
			}
			importExistingContacts = result.contacts;
			importOpen = true;
		} catch (caught) {
			error = (caught as Error).message || 'Unable to load contacts for import';
		} finally {
			openingImport = false;
		}
	}

	async function saveContact(form: ContactFormValue): Promise<{ ok: boolean; error?: string }> {
		try {
			if (editingContact) {
				const editedId = editingContact.id;
				await apiUpdateContact(editedId, form);
				formOpen = false;
				await loadContacts(query);
				selectedId = editedId;
			} else {
				const created = await apiCreateContact(form);
				if (data) {
					data = {
						...data,
						contacts: [...data.contacts, created],
						total: data.total + 1
					};
				}
				selectedId = created.id;
				formOpen = false;
			}
			return { ok: true };
		} catch (caught) {
			return { ok: false, error: (caught as Error).message || 'Unable to save contact' };
		}
	}

	async function confirmDelete() {
		if (!selected || !canMutateSelected || deleting) return;
		deleting = true;
		deleteError = '';
		try {
			await apiDeleteContact(selected.id);
			if (data) {
				const remaining = data.contacts.filter((contact) => contact.id !== selected.id);
				data = { ...data, contacts: remaining, total: Math.max(0, data.total - 1) };
				selectedId = remaining[0]?.id ?? null;
			}
			deleteOpen = false;
		} catch (caught) {
			deleteError = (caught as Error).message || 'Unable to delete contact';
		} finally {
			deleting = false;
		}
	}

	function composeToSelected() {
		if (!selected) return;
		const email = contactPrimaryEmail(selected);
		if (email) openCompose({ to: email });
	}

	onMount(() => {
		void (async () => {
			await loadContacts('');
			const pending = takePendingContact();
			const email = pending?.email.trim().slice(0, 320) ?? '';
			const name = pending?.name.trim().slice(0, 255) ?? '';
			if (data?.supported && /^[^\s@]+@[^\s@]+$/.test(email)) {
				openCreate({
					name,
					emails: [{ address: email, type: 'other' }]
				});
			}
		})();
		return () => requestController?.abort();
	});
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Contacts' })}</title>
</svelte:head>

<div class="h-full min-h-0 flex flex-col bg-bg">
	<header class="h-14 shrink-0 px-4 md:px-5 border-b border-border bg-surface flex items-center gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="text-base font-semibold text-text">Contacts</h1>
			{#if data?.supported}
				<p class="text-2xs text-text-tertiary">{data.total} {data.total === 1 ? 'contact' : 'contacts'}</p>
			{/if}
		</div>
		<button
			type="button"
			aria-label="Import contacts"
			disabled={!canMutate || openingImport}
			onclick={openImport}
			class="h-9 px-3 rounded-lg border border-border text-sm text-text-secondary hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
		>
			Import
		</button>
		<button
			type="button"
			aria-label="New contact"
			disabled={!canMutate}
			onclick={() => openCreate()}
			class="h-9 px-3 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
		>
			<span aria-hidden="true">+</span> New contact
		</button>
	</header>

	{#if loading && !data}
		<div class="flex-1 grid place-items-center" role="status" aria-live="polite">
			<div class="text-center">
				<div class="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-border border-t-accent animate-spin"></div>
				<p class="text-sm text-text-secondary">Loading contacts…</p>
			</div>
		</div>
	{:else if error && !data}
		<div class="flex-1 grid place-items-center px-6">
			<div class="max-w-sm text-center">
				<h2 class="text-base font-semibold text-text mb-1">Contacts could not be loaded</h2>
				<p class="text-sm text-text-tertiary mb-4">{error}</p>
				<button type="button" class="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer" onclick={() => loadContacts()}>
					Try again
				</button>
			</div>
		</div>
	{:else if data && !data.supported}
		<div class="flex-1 grid place-items-center px-6">
			<div class="max-w-md text-center">
				<div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface border border-border grid place-items-center text-text-tertiary">
					<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
						<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-text mb-1">Contacts are not available</h2>
				<p class="text-sm text-text-tertiary">This mail account does not advertise JMAP Contacts support.</p>
			</div>
		</div>
	{:else}
		<div class="flex-1 min-h-0 grid md:grid-cols-[minmax(260px,360px)_1fr]">
			<section class="min-h-0 border-r border-border bg-surface flex flex-col {selected ? 'hidden md:flex' : 'flex'}" aria-label="Contact list">
				<form class="p-3 border-b border-border" onsubmit={submitSearch}>
					<label class="relative block">
						<span class="sr-only">Search contacts</span>
						<svg class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
							<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
						</svg>
						<input
							type="search"
							bind:value={query}
							placeholder="Search contacts"
							maxlength="255"
							class="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-hover border border-border focus:border-accent text-sm text-text placeholder-text-tertiary outline-none"
						/>
					</label>
				</form>

				{#if error}
					<div class="mx-3 mt-3 p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert">{error}</div>
				{/if}

				{#if contacts.length === 0}
					<div class="flex-1 grid place-items-center px-6 text-center">
						<div>
							<h2 class="text-sm font-medium text-text">{query ? 'No matching contacts' : 'No contacts yet'}</h2>
							<p class="text-xs text-text-tertiary mt-1">{query ? 'Try a different search.' : 'Create one or import an Apple or Google export.'}</p>
						</div>
					</div>
				{:else}
					<div class="flex-1 overflow-y-auto py-2">
						{#each groups as group (group.letter)}
							<div class="px-3 pt-2 pb-1 text-3xs font-semibold tracking-wider text-text-tertiary" aria-hidden="true">{group.letter}</div>
							{#each group.contacts as contact (contact.id)}
								<button
									type="button"
									onclick={() => selectedId = contact.id}
									aria-current={selectedId === contact.id ? 'true' : undefined}
									class="w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer {selectedId === contact.id ? 'bg-accent/10' : 'hover:bg-surface-hover'}"
								>
									<span class="w-9 h-9 shrink-0 rounded-full bg-accent/15 text-accent-fg grid place-items-center text-sm font-semibold">
										{contactDisplayName(contact).slice(0, 1).toUpperCase()}
									</span>
									<span class="min-w-0">
										<span class="block text-sm font-medium text-text truncate">{contactDisplayName(contact)}</span>
										<span class="block text-xs text-text-tertiary truncate">{contactPrimaryEmail(contact) || contactPhones(contact)[0]?.number || 'No email or phone'}</span>
									</span>
								</button>
							{/each}
						{/each}
					</div>
				{/if}
			</section>

			<section class="min-h-0 overflow-y-auto {selected ? 'block' : 'hidden md:block'}" aria-label="Contact details">
				{#if selected}
					<div class="max-w-3xl mx-auto px-5 md:px-10 py-6 md:py-10">
						<button type="button" class="md:hidden mb-5 text-sm text-accent-fg cursor-pointer" onclick={() => selectedId = null}>
							← All contacts
						</button>
						<div class="flex flex-col sm:flex-row sm:items-start gap-5 pb-7 border-b border-border">
							<div class="w-20 h-20 shrink-0 rounded-full bg-accent/15 text-accent-fg grid place-items-center text-2xl font-semibold">
								{contactDisplayName(selected).slice(0, 1).toUpperCase()}
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-2xl font-semibold text-text break-words">{contactDisplayName(selected)}</h2>
								{#if Object.values(selected.organizations ?? {})[0]?.name}
									<p class="text-sm text-text-tertiary mt-1">{Object.values(selected.organizations ?? {})[0].name}</p>
								{/if}
								<div class="flex flex-wrap gap-2 mt-4">
									<button
										type="button"
										aria-label="Compose email"
										disabled={!contactPrimaryEmail(selected)}
										onclick={composeToSelected}
										class="px-3 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-40 cursor-pointer"
									>
										Compose email
									</button>
									<button type="button" aria-label="Edit contact" disabled={!canMutateSelected} onclick={openEdit} class="px-3 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
										Edit
									</button>
									<button type="button" aria-label="Delete contact" disabled={!canMutateSelected} onclick={() => { deleteError = ''; deleteOpen = true; }} class="px-3 py-2 rounded-lg border border-border text-sm text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
										Delete
									</button>
								</div>
							</div>
						</div>

						<div class="py-6 space-y-6">
							{#if contactEmails(selected).length > 0}
								<div>
									<h3 class="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Email</h3>
									<div class="space-y-2">
										{#each contactEmails(selected) as email}
											<a class="block text-sm text-accent-fg hover:underline" href={`mailto:${encodeURIComponent(email.address)}`}>{email.address}</a>
										{/each}
									</div>
								</div>
							{/if}
							{#if contactPhones(selected).length > 0}
								<div>
									<h3 class="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Phone</h3>
									{#each contactPhones(selected) as phone}
										<a class="block text-sm text-text" href={`tel:${phone.number}`}>{phone.number}</a>
									{/each}
								</div>
							{/if}
							{#if Object.values(selected.notes ?? {})[0]?.note}
								<div>
									<h3 class="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Notes</h3>
									<p class="text-sm text-text-secondary whitespace-pre-wrap">{Object.values(selected.notes ?? {})[0].note}</p>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<div class="h-full grid place-items-center text-center px-6">
						<div>
							<h2 class="text-sm font-medium text-text">Select a contact</h2>
							<p class="text-xs text-text-tertiary mt-1">Contact details will appear here.</p>
						</div>
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

<ContactFormModal
	open={formOpen}
	contact={editingContact}
	initialValue={createInitial}
	addressBooks={data?.addressBooks ?? []}
	onClose={() => { formOpen = false; }}
	onSave={saveContact}
/>

<ImportContactsModal
	open={importOpen}
	addressBooks={data?.addressBooks ?? []}
	existingContacts={importExistingContacts}
	onClose={() => { importOpen = false; }}
	onImported={(summary) => {
		if (summary.imported > 0) loadContacts(query);
	}}
/>

{#if deleteOpen && selected}
	<div
		class="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-contact-title"
	>
		<div class="w-full max-w-sm rounded-xl bg-surface border border-border shadow-2xl p-5">
			<h2 id="delete-contact-title" class="text-lg font-semibold text-text">Delete contact?</h2>
			<p class="mt-2 text-sm text-text-secondary">
				This permanently deletes {contactDisplayName(selected)} from Stalwart.
			</p>
			{#if deleteError}
				<div class="mt-3 p-3 rounded-lg bg-danger/10 text-danger text-sm" role="alert">{deleteError}</div>
			{/if}
			<div class="mt-5 flex justify-end gap-2">
				<button type="button" disabled={deleting} class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover cursor-pointer" onclick={() => { deleteOpen = false; }}>
					Cancel
				</button>
				<button type="button" disabled={deleting} aria-label="Confirm delete contact" class="px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium disabled:opacity-50 cursor-pointer" onclick={confirmDelete}>
					{deleting ? 'Deleting…' : 'Delete contact'}
				</button>
			</div>
		</div>
	</div>
{/if}
