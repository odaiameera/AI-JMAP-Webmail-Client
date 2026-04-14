<script lang="ts">
	import { composeOpen, composeData, closeCompose } from '$lib/stores/compose';

	let to = $state('');
	let cc = $state('');
	let subject = $state('');
	let body = $state('');
	let inReplyTo = $state('');
	let references = $state('');
	let showCc = $state(false);
	let sending = $state(false);
	let savingDraft = $state(false);
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
			showCc = !!data?.cc;
			error = '';
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeCompose();
		}
	}

	async function postApi(endpoint: string): Promise<{ ok: boolean; error?: string }> {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ to, cc, subject, body, inReplyTo, references })
		});

		const result = await res.json();

		if (result.success) {
			return { ok: true };
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $composeOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/60 z-40"
		role="button"
		tabindex="-1"
		onclick={closeCompose}
		onkeydown={(e) => e.key === 'Enter' && closeCompose()}
	></div>

	<!-- Modal -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-4 md:inset-auto md:bottom-4 md:right-4 md:w-[600px] md:h-[520px] bg-surface border border-border rounded-xl shadow-2xl z-50 flex flex-col"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
			<h2 class="text-sm font-semibold text-text">
				{inReplyTo ? 'Reply' : 'New Message'}
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
		<div class="flex-1 px-4 py-2 min-h-0">
			<textarea
				bind:value={body}
				class="w-full h-full bg-transparent text-sm text-text outline-none resize-none placeholder-text-tertiary"
				style="font-family: Calibri, 'Segoe UI', Arial, sans-serif;"
				placeholder="Write your message..."
			></textarea>
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
			<button
				onclick={closeCompose}
				class="text-text-tertiary hover:text-red-400 text-sm px-3 py-1.5 rounded-lg
					hover:bg-surface-hover transition-colors cursor-pointer"
			>
				Discard
			</button>
		</div>
	</div>
{/if}
