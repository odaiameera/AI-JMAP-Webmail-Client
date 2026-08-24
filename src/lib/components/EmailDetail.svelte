<script lang="ts">
	import type { Email, Mailbox } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { openCompose } from '$lib/stores/compose';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getContext } from 'svelte';
	import { renderEmailBodyHtml } from '$lib/utils/email-body';
	import FolderPicker from './FolderPicker.svelte';
	import AttachmentBar from './AttachmentBar.svelte';
	import InvitationCard from './InvitationCard.svelte';
	import EventModal from './calendar/EventModal.svelte';
	import { apiCreateEvent } from '$lib/calendar/api';
	import { fromDayKey } from '$lib/calendar/dates';
	import { showToast } from '$lib/stores/toast';
	import type { CalendarInfo, EventWritePayload } from '$lib/calendar/types';
	import { queueSenderForContacts } from '$lib/contacts/navigation';
	import { AI_ASSISTANT_CONTEXT, type AIAssistantContext } from '$lib/types/assistant';

	const allLabels = getContext<Label[]>('labels') ?? [];
	const aiAssistant = getContext<AIAssistantContext>(AI_ASSISTANT_CONTEXT);

	let { email, compact = false }: { email: Email; compact?: boolean } = $props();

	$effect(() => {
		const id = email.id;
		aiAssistant?.setCurrentEmail(id);
		return () => aiAssistant?.clearCurrentEmail(id);
	});

	const mailboxes = $derived<Mailbox[]>(page.data.mailboxes ?? []);

	const from = $derived(email.from?.[0]);
	const toList = $derived(email.to ?? []);
	const ccList = $derived(email.cc ?? []);
	const isDraft = $derived('$draft' in email.keywords);
	const isRead = $derived('$seen' in email.keywords);
	const isUnsubscribed = $derived('$unsubscribed' in email.keywords);

	// Flagged state is driven by local $state, not a $derived off email.keywords.
	// `email` comes from SvelteKit load data, which is NOT a $state proxy, so a
	// deep mutation of email.keywords wouldn't re-render the star. Seed from the
	// prop and resync whenever a different email is shown.
	let isFlagged = $state('$flagged' in email.keywords);
	$effect(() => {
		isFlagged = '$flagged' in email.keywords;
	});

	// Optimistic star toggle — instant UI, revert on failure.
	async function toggleFlag() {
		const next = !isFlagged;
		isFlagged = next; // reactive, drives the icon immediately
		// Keep the underlying load-data object consistent too (harmless if it
		// isn't reactive; correct if anything else reads it).
		if (next) email.keywords['$flagged'] = true;
		else delete email.keywords['$flagged'];
		try {
			const res = await fetch(`/api/email/${email.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: next ? 'flag' : 'unflag' })
			});
			if (!res.ok) throw new Error();
		} catch {
			isFlagged = !next;
			if (next) delete email.keywords['$flagged'];
			else email.keywords['$flagged'] = true;
		}
	}

	/**
	 * Classify the email's `List-Unsubscribe` support:
	 *  - `one-click`: RFC 8058 — both List-Unsubscribe-Post: One-Click AND
	 *    an HTTPS URL. We POST to it server-side.
	 *  - `mailto`: only a mailto URI — we send an empty message.
	 *  - `url`: only an HTTP(S) URL without the POST header — open in a
	 *    new tab (human interaction required on the sender's site).
	 *  - `none`: no unsubscribe support at all.
	 */
	type UnsubMode = 'one-click' | 'mailto' | 'url' | 'none';
	interface UnsubInfo {
		mode: UnsubMode;
		url?: string;
		mailto?: string;
	}

	const unsubInfo = $derived.by<UnsubInfo>(() => {
		const header = email['header:list-unsubscribe:asText'];
		const postHeader = email['header:list-unsubscribe-post:asText'];
		if (!header) return { mode: 'none' };

		const httpsMatch = header.match(/<(https:\/\/[^>]+)>/i);
		const anyUrlMatch = header.match(/<(https?:\/\/[^>]+)>/i);
		const mailtoMatch = header.match(/<(mailto:[^>]+)>/i);

		if (postHeader?.toLowerCase().includes('one-click') && httpsMatch) {
			return { mode: 'one-click', url: httpsMatch[1] };
		}
		if (mailtoMatch) return { mode: 'mailto', mailto: mailtoMatch[1] };
		if (anyUrlMatch) return { mode: 'url', url: anyUrlMatch[1] };
		return { mode: 'none' };
	});
	// Label ids are also mailbox ids now; skip them when picking a source
	// mailbox for move-style actions (archive/trash/spam) so we don't
	// accidentally treat a label as the email's home folder.
	const labelIdSet = $derived(new Set(allLabels.map((l) => l.id)));
	const sourceMailboxId = $derived(
		Object.keys(email.mailboxIds).find((id) => !labelIdSet.has(id)) ?? ''
	);

	// --- Spam classifier output (read-only for display + contextual button) ---
	const spamScore = $derived.by<number | null>(() => {
		const raw = email['header:x-spam-score:asText'];
		if (!raw) return null;
		const parsed = parseFloat(raw.trim());
		return Number.isFinite(parsed) ? parsed : null;
	});
	const spamStatus = $derived(email['header:x-spam-status:asText']?.toLowerCase() ?? '');
	const isFlaggedSpam = $derived(spamStatus.startsWith('yes'));
	const isInJunk = $derived(
		Object.keys(email.mailboxIds).some((id) => {
			const mb = mailboxes.find((m) => m.id === id);
			return mb?.role === 'junk';
		})
	);

	let actionLoading = $state('');
	let showLabelMenu = $state(false);
	let showMovePicker = $state(false);
	let moveTriggerEl = $state<HTMLButtonElement | undefined>(undefined);
	/**
	 * Destination to navigate to after a move/trash/archive. If the email
	 * came from the inbox, go back to /inbox; otherwise fall back to the
	 * source folder so the user lands where they started.
	 */
	function destAfterAction(sourceId: string): string {
		if (!sourceId) return '/inbox';
		const source = mailboxes.find((m) => m.id === sourceId);
		if (source?.role === 'inbox') return '/inbox';
		return `/folder/${sourceId}`;
	}

	async function handleMove(targetMailboxId: string) {
		showMovePicker = false;
		actionLoading = 'move';
		try {
			await fetch(`/api/email/${email.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'moveTo',
					targetMailboxId,
					sourceMailboxId
				})
			});
			goto(destAfterAction(sourceMailboxId));
		} finally {
			actionLoading = '';
		}
	}

	const appliedLabels = $derived(allLabels.filter((l) => email.mailboxIds[l.id] === true));

	// Calendar invitations arrive as a text/calendar MIME part (iMIP) or an
	// .ics attachment — both are structured data, detected without guesswork.
	const calendarPart = $derived(
		(email.attachments ?? []).find((a) => {
			const type = a.type?.toLowerCase() ?? '';
			const name = a.name?.toLowerCase() ?? '';
			return (
				type.startsWith('text/calendar') ||
				type === 'application/ics' ||
				name.endsWith('.ics')
			);
		})
	);

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


	function handleEditDraft() {
		openCompose({
			to: email.to?.map((a) => a.email).join(', ') ?? '',
			cc: email.cc?.map((a) => a.email).join(', ') ?? '',
			subject: email.subject ?? '',
			body: getBodyHtml(),
			draftId: email.id
		});
	}

	// Mark-as-read after a second of viewing. An $effect keyed on the email
	// id (not onMount) because in the reading pane this component stays
	// mounted while the user moves between messages.
	$effect(() => {
		const id = email.id;
		if (email.keywords['$seen']) return;
		const timer = setTimeout(async () => {
			await fetch(`/api/email/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'markRead' })
			});
			email.keywords['$seen'] = true;
			invalidateAll();
		}, 1000);
		return () => clearTimeout(timer);
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString('en-US', {
			weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
		});
	}

	function getBodyHtml(): string {
		return renderEmailBodyHtml(email) || '<p style="color: #71717A;">No content</p>';
	}

	function getHtmlQuotedBlock(): string {
		const sender = email.from?.[0];
		if (!sender) return '';
		const dateStr = formatDate(email.receivedAt);
		const fromStr = sender.name ? `${sender.name} &lt;${sender.email}&gt;` : sender.email;
		const originalBody = getBodyHtml();
		return `<br><br><blockquote style="margin: 0 0 0 0.8ex; border-left: 3px solid #6366F1; padding-left: 1ex; color: #71717A;"><div><strong>From:</strong> ${fromStr}</div><div><strong>Date:</strong> ${dateStr}</div><div><strong>Subject:</strong> ${email.subject ?? ''}</div><br>${originalBody}</blockquote>`;
	}

	function handleAddSenderToContacts() {
		if (!from?.email) return;
		goto(queueSenderForContacts(from));
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

	// --- AI event extraction ("create event from this email") ---

	const aiEnabled = $derived(page.data.aiEnabled === true);
	let assistantOpen = $state(false);
	let assistantBusy = $state(false);
	let assistantQuestion = $state('');
	let assistantResult = $state('');
	let assistantError = $state('');
	let assistantResultKind = $state<'summarize' | 'answer' | 'draft' | null>(null);
	$effect(() => {
		// Do not carry an answer or generated draft into another message when
		// the reading pane swaps the `email` prop without remounting this view.
		void email.id;
		assistantOpen = false;
		assistantQuestion = '';
		assistantResult = '';
		assistantError = '';
		assistantResultKind = null;
	});
	let aiBusy = $state(false);
	let aiModalOpen = $state(false);
	let aiCalendars = $state<CalendarInfo[]>([]);
	let aiPrefill = $state<{ start: Date; end: Date; allDay: boolean } | null>(null);
	let aiExtras = $state<{ title?: string; location?: string; description?: string } | null>(null);

	async function runAssistant(action: 'summarize' | 'answer' | 'draft') {
		if (assistantBusy || (action === 'answer' && !assistantQuestion.trim())) return;
		const requestEmailId = email.id;
		assistantBusy = true;
		assistantError = '';
		try {
			const res = await fetch('/api/ai/assistant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					subject: email.subject ?? '',
					from: from?.name ? `${from.name} <${from.email}>` : (from?.email ?? ''),
					receivedAt: email.receivedAt,
					html: getBodyHtml(),
					question: action === 'answer' ? assistantQuestion.trim() : undefined
				})
			});
			const data = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
			if (!res.ok || !data.result) throw new Error(data.error ?? 'The assistant failed');
			if (email.id !== requestEmailId) return;
			assistantResult = data.result;
			assistantResultKind = action;
		} catch (err) {
			assistantError = err instanceof Error ? err.message : 'The assistant failed';
		} finally {
			assistantBusy = false;
		}
	}

	function textToHtml(text: string): string {
		const escaped = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
		return escaped
			.split(/\n{2,}/)
			.map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
			.join('');
	}

	function useAssistantDraft() {
		const sender = email.from?.[0];
		if (!sender || !assistantResult) return;
		const originalSubject = email.subject ?? '';
		openCompose({
			to: sender.email,
			cc: '',
			subject: originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`,
			body: `${textToHtml(assistantResult)}${getHtmlQuotedBlock()}`,
			inReplyTo: email.id,
			references: email.id
		});
	}

	async function extractEventWithAI() {
		if (aiBusy) return;
		aiBusy = true;
		try {
			const [exRes, calRes] = await Promise.all([
				fetch('/api/ai/extract-event', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						subject: email.subject ?? '',
						html: getBodyHtml(),
						from: from?.email ?? '',
						receivedAt: email.receivedAt,
						timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
					})
				}),
				fetch('/api/calendar/calendars')
			]);
			const ex = (await exRes.json().catch(() => ({}))) as {
				found?: boolean;
				title?: string;
				date?: string;
				startTime?: string | null;
				endTime?: string | null;
				allDay?: boolean;
				location?: string | null;
				notes?: string | null;
				error?: string;
			};
			if (!exRes.ok) {
				showToast({ message: ex.error ?? 'Event extraction failed' });
				return;
			}
			if (!ex.found || !ex.date) {
				showToast({ message: 'No event details found in this email.' });
				return;
			}
			const cals = (await calRes.json().catch(() => ({}))) as { calendars?: CalendarInfo[] };
			aiCalendars = cals.calendars ?? [];

			const day = fromDayKey(ex.date);
			if (ex.allDay || !ex.startTime) {
				aiPrefill = { start: day, end: new Date(day.getTime() + 86400000), allDay: true };
			} else {
				const [sh, sm] = ex.startTime.split(':').map(Number);
				const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
				let end: Date;
				if (ex.endTime) {
					const [eh, em] = ex.endTime.split(':').map(Number);
					end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
					if (end <= start) end = new Date(start.getTime() + 3600000);
				} else {
					end = new Date(start.getTime() + 3600000);
				}
				aiPrefill = { start, end, allDay: false };
			}
			aiExtras = {
				title: ex.title,
				location: ex.location ?? '',
				description: ex.notes ?? ''
			};
			aiModalOpen = true;
		} catch {
			showToast({ message: 'Event extraction failed' });
		} finally {
			aiBusy = false;
		}
	}

	async function saveExtractedEvent(payload: EventWritePayload): Promise<{ ok: boolean; error?: string }> {
		const res = await apiCreateEvent(payload);
		if (!res.ok) return { ok: false, error: res.error ?? 'Failed to create event' };
		const date = payload.allDay ? payload.start : payload.start.slice(0, 10);
		showToast({
			message: 'Event added to your calendar',
			action: { label: 'View', onClick: () => goto(`/calendar?view=day&date=${date}`) }
		});
		return { ok: true };
	}

	// --- Unsubscribe flow ---

	let unsubLoading = $state(false);
	let unsubToast = $state<{ kind: 'success' | 'error'; message: string } | null>(null);
	let unsubToastTimer: ReturnType<typeof setTimeout> | undefined;

	function showUnsubToast(kind: 'success' | 'error', message: string, ms = 3500) {
		unsubToast = { kind, message };
		if (unsubToastTimer) clearTimeout(unsubToastTimer);
		unsubToastTimer = setTimeout(() => { unsubToast = null; }, ms);
	}

	async function handleUnsubscribe() {
		if (unsubInfo.mode === 'none' || isUnsubscribed) return;

		// URL-only (no one-click POST header) still just opens the sender's
		// page — required because a real human click-through is needed there.
		if (unsubInfo.mode === 'url') {
			if (unsubInfo.url) window.open(unsubInfo.url, '_blank', 'noopener,noreferrer');
			return;
		}

		// Mailto sends from the user's account. Confirm once — this is a
		// silent send, not a draft, and senders key on the sender address.
		if (unsubInfo.mode === 'mailto') {
			const ok = confirm('Send an unsubscribe email to this sender from your account?');
			if (!ok) return;
		}

		unsubLoading = true;
		try {
			const res = await fetch(`/api/email/${email.id}/unsubscribe`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: unsubInfo.mode,
					url: unsubInfo.url,
					mailto: unsubInfo.mailto
				})
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok && data?.success) {
				// Optimistic local flag — server also persisted the keyword.
				email.keywords['$unsubscribed'] = true;
				showUnsubToast('success', 'Unsubscribe request sent.');
			} else {
				showUnsubToast('error', data?.error ?? `Failed (HTTP ${res.status})`);
			}
		} catch (err) {
			showUnsubToast('error', err instanceof Error ? err.message : 'Network error');
		} finally {
			unsubLoading = false;
		}
	}
</script>

<div class="h-full flex flex-col relative">
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
					{#if from?.email}
						<button
							type="button"
							onclick={handleAddSenderToContacts}
							aria-label="Add sender to contacts"
							title="Add to Contacts"
							class="p-1 rounded text-text-tertiary hover:text-accent hover:bg-accent/10 cursor-pointer"
						>
							<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>
						</button>
					{/if}
				</div>
				<div class="text-xs text-text-tertiary mt-1">
					<span>To: {toList.map(a => a.name || a.email).join(', ')}</span>
					{#if ccList.length > 0}
						<span class="ml-3">Cc: {ccList.map(a => a.name || a.email).join(', ')}</span>
					{/if}
				</div>
			</div>
			<div class="flex flex-col items-end gap-1 shrink-0">
				<span class="text-xs text-text-tertiary">{formatDate(email.receivedAt)}</span>
				{#if spamScore !== null}
					<span
						class="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full
							{isFlaggedSpam
								? 'bg-danger/10 text-danger'
								: spamScore > 3
									? 'bg-warning/10 text-warning'
									: 'bg-text-tertiary/10 text-text-tertiary'}"
						title={isFlaggedSpam ? 'Flagged as spam by the classifier' : 'Spam classifier score'}
					>
						Spam score: {spamScore.toFixed(1)}
					</span>
				{/if}
			</div>
		</div>
	</header>

	<!-- Ribbon -->
	<div class="ribbon flex items-center justify-between {compact ? 'px-4' : 'px-6'} py-2 border-b border-border shrink-0">
		<div class="flex items-center gap-1">
			{#if isDraft}
				<button onclick={handleEditDraft} class="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg px-3 py-1 transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
					Edit draft
				</button>
			{:else}
				<button onclick={handleReply} title="Reply" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
				</button>
				<button onclick={handleReplyAll} title="Reply All" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
				</button>
				<button onclick={handleForward} title="Forward" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			{#if aiEnabled && !isDraft}
				<button
					onclick={() => { assistantOpen = !assistantOpen; }}
					title="Open mail assistant"
					aria-pressed={assistantOpen}
					class="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer
						{assistantOpen ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-accent'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>
						<path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>
					</svg>
				</button>
			{/if}
			<button
				onclick={toggleFlag}
				title={isFlagged ? 'Unstar' : 'Star'}
				aria-label={isFlagged ? 'Unstar' : 'Star'}
				aria-pressed={isFlagged}
				class="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer
					{isFlagged ? 'text-warning' : 'text-text-secondary hover:text-warning'}"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill={isFlagged ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
				</svg>
			</button>
			<button onclick={() => doAction(isRead ? 'markUnread' : 'markRead')} title={isRead ? 'Mark Unread' : 'Mark Read'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				{#if isRead}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
				{/if}
			</button>
			<button
				bind:this={moveTriggerEl}
				onclick={(e) => { e.stopPropagation(); showMovePicker = !showMovePicker; }}
				title="Move to…"
				disabled={actionLoading === 'move'}
				class="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50
					{showMovePicker ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text'}"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M2 9V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2"/>
					<path d="M2 13h10"/>
					<path d="m9 16 3-3-3-3"/>
					<path d="M14 13v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4"/>
				</svg>
			</button>
			{#if showMovePicker}
				<FolderPicker
					{mailboxes}
					labels={allLabels}
					excludeIds={sourceMailboxId ? [sourceMailboxId] : []}
					anchor={moveTriggerEl ?? null}
					align="right"
					onPick={handleMove}
					onClose={() => { showMovePicker = false; }}
				/>
			{/if}
			<button onclick={() => doAction('archive')} title="Archive" disabled={actionLoading === 'archive'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
			</button>
			{#if isInJunk}
				<button
					onclick={() => doAction('notSpam')}
					title="Not spam — move back to Inbox and train the classifier"
					disabled={actionLoading === 'notSpam'}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-success transition-colors cursor-pointer disabled:opacity-50"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
						<path d="m9 12 2 2 4-4"/>
					</svg>
				</button>
			{:else}
				<button
					onclick={() => doAction('spam')}
					title="Mark as spam — move to Junk and train the classifier"
					disabled={actionLoading === 'spam'}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
				</button>
			{/if}
			<button onclick={() => doAction('trash')} title="Trash" disabled={actionLoading === 'trash'} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-danger transition-colors cursor-pointer disabled:opacity-50">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
			</button>
			<div class="w-px h-4 bg-border mx-0.5"></div>
			<button onclick={() => window.print()} title="Print" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
			</button>
			{#if aiEnabled && !isDraft}
				<button
					onclick={extractEventWithAI}
					title="Create calendar event from this email (AI)"
					disabled={aiBusy}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
				>
					{#if aiBusy}
						<span class="block w-4 h-4 rounded-full border-2 border-accent/40 border-t-accent animate-spin"></span>
					{:else}
						<!-- calendar with sparkle -->
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>
							<path d="M16 2v4M8 2v4M3 10h18"/>
							<path d="M18.5 15.5 19.3 17.7 21.5 18.5 19.3 19.3 18.5 21.5 17.7 19.3 15.5 18.5 17.7 17.7z"/>
						</svg>
					{/if}
				</button>
			{/if}
			{#if unsubInfo.mode !== 'none'}
				<div class="w-px h-4 bg-border mx-0.5"></div>
				{#if isUnsubscribed}
					<span class="inline-flex items-center gap-1 px-2 py-1 text-xs text-success" title="Unsubscribed">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						Unsubscribed
					</span>
				{:else}
					<button
						onclick={handleUnsubscribe}
						disabled={unsubLoading}
						title={unsubInfo.mode === 'one-click'
							? 'Unsubscribe (one click)'
							: unsubInfo.mode === 'mailto'
								? 'Send unsubscribe email'
								: 'Open sender\'s unsubscribe page'}
						class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{#if unsubLoading}
							<span class="w-3 h-3 rounded-full border-2 border-danger/40 border-t-red-400 animate-spin"></span>
							Unsubscribing…
						{:else}
							Unsubscribe
						{/if}
					</button>
				{/if}
			{/if}
		</div>
	</div>

	{#if calendarPart}
		{#key calendarPart.blobId}
			<InvitationCard emailId={email.id} blobId={calendarPart.blobId} {compact} />
		{/key}
	{/if}

	<AttachmentBar emailId={email.id} attachments={email.attachments ?? []} />

	{#if assistantOpen}
		<section class="shrink-0 border-b border-border bg-surface-hover/40 {compact ? 'px-4' : 'px-6'} py-3">
			<div class="flex items-center justify-between gap-3 mb-3">
				<div>
					<h2 class="text-sm font-semibold text-text">Mail assistant</h2>
					<p class="text-xs text-text-tertiary">Reviews this email only. Generated replies are never sent automatically.</p>
				</div>
				<button onclick={() => { assistantOpen = false; }} aria-label="Close mail assistant" class="text-text-tertiary hover:text-text cursor-pointer">&times;</button>
			</div>

			<div class="flex flex-wrap gap-2">
				<button onclick={() => runAssistant('summarize')} disabled={assistantBusy} class="px-3 py-1.5 rounded-lg text-xs border border-border text-text hover:border-accent disabled:opacity-50 cursor-pointer">Summarize</button>
				<button onclick={() => runAssistant('draft')} disabled={assistantBusy} class="px-3 py-1.5 rounded-lg text-xs border border-border text-text hover:border-accent disabled:opacity-50 cursor-pointer">Draft reply</button>
				<form class="flex min-w-[240px] flex-1 gap-2" onsubmit={(event) => { event.preventDefault(); runAssistant('answer'); }}>
					<input bind:value={assistantQuestion} maxlength="500" placeholder="Ask about this email…" class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text outline-none focus:border-accent" />
					<button type="submit" disabled={assistantBusy || !assistantQuestion.trim()} class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs disabled:opacity-50 cursor-pointer">Ask</button>
				</form>
			</div>

			{#if assistantBusy}
				<p class="mt-3 text-xs text-text-tertiary">Thinking…</p>
			{:else if assistantError}
				<p class="mt-3 text-xs text-danger">{assistantError}</p>
			{:else if assistantResult}
				<div class="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-3">
					<p class="whitespace-pre-wrap text-sm leading-6 text-text">{assistantResult}</p>
					{#if assistantResultKind === 'draft'}
						<button onclick={useAssistantDraft} class="mt-3 px-3 py-1.5 rounded-lg bg-accent text-white text-xs cursor-pointer">Use as reply</button>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Email body in sandboxed iframe. The iframe always fills the
	     remaining vertical space of the reading pane, regardless of the
	     email's content height — short emails no longer collapse the
	     pane, and long ones scroll inside the iframe instead of the
	     wrapper. -->
	<div class="flex-1 overflow-hidden {compact ? 'px-4 py-3' : 'px-6 py-4'}">
		<!-- bg-white matches the document's body background so swapping
		     srcdoc (next/previous message) repaints white-on-white instead
		     of flashing through the dark page background. -->
		<iframe
			srcdoc={iframeContent}
			sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
			title="Email content"
			class="w-full h-full border-none rounded bg-white"
		></iframe>
	</div>

	<EventModal
		open={aiModalOpen}
		calendars={aiCalendars}
		prefill={aiPrefill}
		prefillExtras={aiExtras}
		onSubmit={saveExtractedEvent}
		onClose={() => {
			aiModalOpen = false;
			aiPrefill = null;
			aiExtras = null;
		}}
	/>

	<!-- Unsubscribe toast — fixed relative to the detail surface so it
	     floats over the ribbon without affecting its layout. Solid
	     bg-surface so it's clearly legible over the mail body. -->
	{#if unsubToast}
		<div
			role="status"
			aria-live="polite"
			class="absolute top-16 right-6 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border text-xs shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-compose-modal-in
				{unsubToast.kind === 'success' ? 'border-border text-text' : 'border-danger/40 text-danger'}"
		>
			{#if unsubToast.kind === 'success'}
				<svg class="text-accent shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"/>
				</svg>
			{:else}
				<svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="8" x2="12" y2="12"/>
					<line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
			{/if}
			<span>{unsubToast.message}</span>
		</div>
	{/if}
</div>
