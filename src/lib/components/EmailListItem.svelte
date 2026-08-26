<script lang="ts">
	import type { Email } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { getContext, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatTimeOfDay } from '$lib/utils/date-buckets';
	import EmailRowActions from './EmailRowActions.svelte';
	import SenderAvatar from './SenderAvatar.svelte';

	const allLabels = getContext<Label[]>('labels') ?? [];
	const getRemindedIds = getContext<() => Set<string>>('remindedIds');
	const listMailboxId = getContext<() => string>('listMailboxId');
	/** emailId → ISO return time for mail parked in Remind Me Later. */
	const getReminderAt = getContext<(() => Map<string, string>) | undefined>('reminderAt');

	let { email, selected = false, onSelect, onClick, onDragStart, active = false }: {
		email: Email;
		selected?: boolean;
		onSelect?: (id: string, checked: boolean) => void;
		onClick?: (email: Email) => void;
		onDragStart?: (email: Email, e: DragEvent) => void;
		active?: boolean;
	} = $props();

	const wasReminded = $derived(getRemindedIds?.().has(email.id) ?? false);
	const reminderAt = $derived(getReminderAt?.().get(email.id) ?? null);
	const isUnread = $derived(!('$seen' in email.keywords));
	const sourceMailboxId = $derived(
		listMailboxId?.() || Object.keys(email.mailboxIds)[0] || ''
	);

	const isRead = $derived('$seen' in email.keywords);
	const senderName = $derived(
		email.from?.[0]?.name || email.from?.[0]?.email || 'Unknown'
	);
	const senderEmail = $derived(email.from?.[0]?.email ?? '');
	const preview = $derived(
		!email.preview || /^[A-Z_]+$/.test(email.preview.trim()) ? '' : email.preview
	);
	const appliedLabels = $derived(
		allLabels.filter((l) => email.mailboxIds[l.id] === true)
	);

	function textColorForBg(hex: string): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		// Relative luminance (sRGB)
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.55 ? '#000000' : '#ffffff';
	}

	// Double-click marks the row read without opening it (quick triage). To
	// tell a single click from the first click of a double-click we defer the
	// open by one double-click window; a dblclick cancels that timer.
	const DBLCLICK_MS = 220;
	let openTimer: ReturnType<typeof setTimeout> | null = null;
	onDestroy(() => { if (openTimer) clearTimeout(openTimer); });

	function openRow() {
		if (onClick) onClick(email);
		else goto(`/email/${email.id}`);
	}

	function handleRowClick(e: MouseEvent) {
		// Leave modifier / non-left clicks to the browser (open in new tab etc.).
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		if (e.detail > 1) return; // second click of a double-click — handled below
		if (openTimer) clearTimeout(openTimer);
		openTimer = setTimeout(() => {
			openTimer = null;
			openRow();
		}, DBLCLICK_MS);
	}

	function handleRowDblClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (openTimer) {
			clearTimeout(openTimer);
			openTimer = null;
		}
		void markRead();
	}

	async function markRead() {
		if (!isUnread) return;
		try {
			await fetch(`/api/email/${email.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'markRead', sourceMailboxId })
			});
			await invalidateAll();
		} catch {
			// Best effort — a failed mark-read shouldn't disrupt the list.
		}
	}

	function formatReturnTime(iso: string): string {
		const d = new Date(iso);
		const today = new Date();
		const sameDay = d.toDateString() === today.toDateString();
		const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		if (sameDay) return `today ${time}`;
		return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
	}

</script>

<a
	href="/email/{email.id}"
	onclick={handleRowClick}
	ondblclick={handleRowDblClick}
	draggable="true"
	ondragstart={(e) => onDragStart?.(email, e)}
	class="email-row group relative flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-surface-hover transition-colors cursor-pointer no-underline
		{selected ? 'bg-accent/10 border-l-2 border-l-accent' : ''} {active ? 'bg-surface-hover' : ''}"
>
	<!-- Leading slot: sender avatar by default, swapping to a selection
	     checkbox on row hover (or whenever the row is selected, so the
	     selection stays visible after the pointer leaves). -->
	<div class="relative w-8 h-8 shrink-0">
		<!-- Avatar layer. Also hides on keyboard focus-within so the checkbox
		     can take its place for keyboard users, not just on pointer hover. -->
		<div
			class="absolute inset-0 flex items-center justify-center transition-opacity
				{selected ? 'opacity-0 pointer-events-none' : 'group-hover:opacity-0 group-hover:pointer-events-none group-focus-within:opacity-0 group-focus-within:pointer-events-none'}"
		>
			<SenderAvatar email={senderEmail} name={senderName} size={32} />
		</div>
		<!-- Checkbox layer (on top so it catches the click when visible).
		     Revealed on hover OR keyboard focus so it's never an invisible
		     focus stop. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 flex items-center justify-center transition-opacity
				{selected ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'}"
		>
			<div
				class="w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface
					{selected ? 'bg-accent border-accent' : 'border-text-tertiary hover:border-text-secondary'}"
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect?.(email.id, !selected); }}
				onkeydown={(e) => { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect?.(email.id, !selected); } }}
				role="checkbox"
				aria-checked={selected}
				aria-label="Select email from {senderName}"
				tabindex={0}
			>
				{#if selected}
					<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				{/if}
			</div>
		</div>
	</div>

	<div class="flex-1 min-w-0">
		<div class="flex items-baseline justify-between gap-2">
			<span class="min-w-0 flex items-center gap-2 text-sm {isRead ? 'text-text-secondary font-normal' : 'text-text font-semibold'}">
				{#if !isRead}
					<span class="w-2 h-2 rounded-full bg-unread shrink-0" title="Unread"></span>
				{/if}
				<span class="truncate">{senderName}</span>
			</span>
			<span class="text-xs text-text-tertiary shrink-0" title={new Date(email.receivedAt).toLocaleString()}>
				{formatTimeOfDay(email.receivedAt)}
			</span>
		</div>
		<div class="email-subject truncate text-sm {isRead ? 'text-text-secondary' : 'text-text font-medium'} mt-0.5 flex items-center gap-1.5">
			{#if wasReminded}
				<span class="inline-flex items-center text-accent-fg shrink-0" title="Returned from Remind Me Later">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
				</span>
			{/if}
			<span class="truncate">{email.subject || '(no subject)'}</span>
			{#if reminderAt}
				<span
					class="inline-flex items-center gap-1 shrink-0 rounded-full bg-accent/15 text-accent-fg text-3xs font-medium px-1.5 py-0.5"
					title="Snoozed — returns to the inbox automatically"
				>
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
					Returns {formatReturnTime(reminderAt)}
				</span>
			{/if}
			{#if email.hasAttachment}
				<span class="text-text-tertiary shrink-0">📎</span>
			{/if}
		</div>
		{#if appliedLabels.length > 0}
			<div class="email-chips flex items-center gap-1 mt-0.5">
				{#each appliedLabels.slice(0, 2) as label}
					<span class="rounded-sm px-1.5 py-0.5 text-2xs font-medium leading-none"
						style="background-color: {label.color}; color: {textColorForBg(label.color)}">{label.name}</span>
				{/each}
				{#if appliedLabels.length > 2}
					<span class="text-3xs text-text-tertiary font-medium">+{appliedLabels.length - 2}</span>
				{/if}
			</div>
		{/if}
		<div class="email-preview truncate text-xs text-text-tertiary mt-0.5">
			{preview}
		</div>
	</div>

	<EmailRowActions emailId={email.id} {isUnread} {sourceMailboxId} hasReminder={!!reminderAt} />
</a>
