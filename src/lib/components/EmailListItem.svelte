<script lang="ts">
	import type { Email } from '$lib/jmap/types';

	let { email, selected = false, onSelect, onClick, active = false }: {
		email: Email;
		selected?: boolean;
		onSelect?: (id: string, checked: boolean) => void;
		onClick?: (email: Email) => void;
		active?: boolean;
	} = $props();

	const isRead = $derived('$seen' in email.keywords);
	const senderName = $derived(
		email.from?.[0]?.name || email.from?.[0]?.email || 'Unknown'
	);

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function handleRowClick(e: MouseEvent) {
		if (onClick) {
			e.preventDefault();
			onClick(email);
		}
	}
</script>

<a
	href="/email/{email.id}"
	onclick={handleRowClick}
	class="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-surface-hover transition-colors cursor-pointer no-underline
		{selected ? 'bg-accent/10 border-l-2 border-l-accent' : ''} {active ? 'bg-surface-hover' : ''}"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center cursor-pointer transition-colors
			{selected ? 'bg-accent border-accent' : 'border-text-tertiary hover:border-text-secondary'}"
		onclick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect?.(email.id, !selected); }}
		onkeydown={(e) => { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect?.(email.id, !selected); } }}
		role="checkbox"
		aria-checked={selected}
		tabindex={0}
	>
		{#if selected}
			<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
		{/if}
	</div>

	{#if !isRead}
		<span class="w-2 h-2 rounded-full bg-unread shrink-0"></span>
	{:else}
		<span class="w-2 h-2 shrink-0"></span>
	{/if}

	<div class="flex-1 min-w-0">
		<div class="flex items-baseline justify-between gap-2">
			<span class="truncate text-sm {isRead ? 'text-text-secondary font-normal' : 'text-text font-semibold'}">
				{senderName}
			</span>
			<span class="text-xs text-text-tertiary shrink-0">
				{formatDate(email.receivedAt)}
			</span>
		</div>
		<div class="truncate text-sm {isRead ? 'text-text-secondary' : 'text-text font-medium'} mt-0.5">
			{email.subject || '(no subject)'}
		</div>
		<div class="truncate text-xs text-text-tertiary mt-0.5">
			{email.preview}
		</div>
	</div>

	{#if email.hasAttachment}
		<span class="text-text-tertiary text-sm shrink-0">📎</span>
	{/if}
</a>
