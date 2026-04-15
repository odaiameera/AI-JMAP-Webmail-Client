<script lang="ts">
	import { composeOpen, composeData, closeCompose, openFullCompose } from '$lib/stores/compose';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	let to = $state('');
	let cc = $state('');
	let subject = $state('');
	let body = $state('');
	let inReplyTo = $state('');
	let references = $state('');
	let draftId = $state<string | undefined>(undefined);
	let showCc = $state(false);
	let sending = $state(false);
	let savingDraft = $state(false);
	let discarding = $state(false);
	let isForward = $state(false);
	let error = $state('');

	// Sync from store when compose opens
	$effect(() => {
		if ($composeOpen) {
			const data = $composeData;
			to = data?.to ?? '';
			cc = data?.cc ?? '';
			subject = data?.subject ?? '';
			body = data?.body ?? '';
			inReplyTo = data?.inReplyTo ?? '';
			references = data?.references ?? '';
			draftId = data?.draftId;
			isForward = !!data?.isForward;
			showCc = !!data?.cc;
			error = '';
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeCompose();
		}
	}

	async function postApi(endpoint: string): Promise<{ ok: boolean; error?: string; draftId?: string }> {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ to, cc, subject, body, inReplyTo, references, draftId })
		});

		const result = await res.json();

		if (result.success) {
			return { ok: true, draftId: result.draftId };
		}

		return { ok: false, error: result.error ?? `Server error (${res.status})` };
	}

	async function handleSend() {
		if (!to.trim()) {
			error = 'Recipient is required';
			return;
		}

		sending = true;
		error = '';

		try {
			const result = await postApi('/api/send');
			if (result.ok) {
				closeCompose();
			} else {
				error = result.error ?? 'Failed to send';
			}
		} catch {
			error = 'Network error';
		} finally {
			sending = false;
		}
	}

	async function handleSaveDraft() {
		savingDraft = true;
		error = '';

		try {
			const result = await postApi('/api/draft');
			if (result.ok) {
				draftId = result.draftId;
				closeCompose();
			} else {
				error = result.error ?? 'Failed to save draft';
			}
		} catch {
			error = 'Network error';
		} finally {
			savingDraft = false;
		}
	}

	async function handleDiscard() {
		if (draftId) {
			discarding = true;
			try {
				await fetch('/api/discard', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ draftId })
				});
			} catch {
				// best effort
			} finally {
				discarding = false;
			}
		}
		closeCompose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $composeOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/60 z-40 animate-compose-backdrop-in"
		role="button"
		tabindex="-1"
		onclick={closeCompose}
		onkeydown={(e) => e.key === 'Enter' && closeCompose()}
	></div>

	<!-- Modal -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-4 md:inset-auto md:bottom-4 md:right-4 md:w-[600px] md:h-[520px] bg-surface border border-border rounded-xl shadow-2xl z-50 flex flex-col animate-compose-modal-in"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
			<h2 class="text-sm font-semibold text-text">
				{inReplyTo ? 'Reply' : isForward ? 'Forward' : draftId ? 'Draft' : 'New Message'}
			</h2>
			<button
				onclick={closeCompose}
				class="text-text-tertiary hover:text-text transition-colors cursor-pointer text-lg leading-none"
			>
				&times;
			</button>
		</div>

		<!-- Fields -->
		<div class="px-4 pt-2 space-y-0 shrink-0">
			<div class="flex items-center border-b border-border py-1.5">
				<label for="compose-to" class="text-xs text-text-tertiary w-10 shrink-0">To</label>
				<input
					id="compose-to"
					bind:value={to}
					type="text"
					class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary"
					placeholder="recipient@example.com"
				/>
				{#if !showCc}
					<button
						onclick={() => showCc = true}
						class="text-xs text-text-tertiary hover:text-text cursor-pointer ml-2"
					>
						Cc
					</button>
				{/if}
			</div>

			{#if showCc}
				<div class="flex items-center border-b border-border py-1.5">
					<label for="compose-cc" class="text-xs text-text-tertiary w-10 shrink-0">Cc</label>
					<input
						id="compose-cc"
						bind:value={cc}
						type="text"
						class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary"
						placeholder="cc@example.com"
					/>
				</div>
			{/if}

			<div class="flex items-center border-b border-border py-1.5">
				<label for="compose-subject" class="text-xs text-text-tertiary w-10 shrink-0">Sub</label>
				<input
					id="compose-subject"
					bind:value={subject}
					type="text"
					class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary"
					placeholder="Subject"
				/>
			</div>
		</div>

		<!-- Body -->
		<div class="flex-1 flex flex-col min-h-0">
			{#key $composeOpen}
				<RichTextEditor bind:value={body} placeholder="Write your message..." />
			{/key}
		</div>

		<!-- Error -->
		{#if error}
			<div class="px-4 pb-2">
				<p class="text-xs text-red-400">{error}</p>
			</div>
		{/if}

		<!-- Footer -->
		<div class="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
			<div class="flex items-center gap-2">
				<button
					onclick={handleSend}
					disabled={sending || savingDraft}
					class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg
						px-4 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
				>
					{sending ? 'Sending...' : 'Send'}
				</button>
				<button
					onclick={handleSaveDraft}
					disabled={sending || savingDraft}
					class="text-text-secondary hover:text-text text-sm px-3 py-1.5 rounded-lg
						hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
				>
					{savingDraft ? 'Saving...' : 'Save Draft'}
				</button>
			</div>
			<div class="flex items-center gap-1">
				<button
					onclick={() => { openFullCompose({ to, cc, subject, body, inReplyTo, references, draftId }); closeCompose(); }}
					title="Open full composer"
					class="text-text-tertiary hover:text-text text-sm p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
				>
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
				</button>
				<button
					onclick={handleDiscard}
					disabled={sending || savingDraft || discarding}
					class="text-text-tertiary hover:text-red-400 text-sm px-3 py-1.5 rounded-lg
						hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
				>
					{discarding ? 'Discarding...' : 'Discard'}
				</button>
			</div>
		</div>
	</div>
{/if}
