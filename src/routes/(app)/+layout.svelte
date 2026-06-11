<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import ComposerShell from '$lib/components/composer/ComposerShell.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, setContext } from 'svelte';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import { profilePhoto } from '$lib/stores/profilePhoto';
	import { realtime } from '$lib/stores/realtime';
	import { calendarNotify } from '$lib/stores/calendarNotify';
	import { showToast } from '$lib/stores/toast';
	import { loadUserState } from '$lib/stores/userState';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// eslint-disable-next-line -- intentionally capturing initial values from server cookies
	let { readingPaneDefault } = data;
	const readingPane = createReadingPaneStore(readingPaneDefault);
	setContext('readingPane', readingPane);
	setContext('labels', data.labels ?? []);
	setContext('rules', data.rules ?? []);

	let searchQuery = $state(page.url.searchParams.get('q') ?? '');

	$effect(() => {
		// Keep the search box in sync with the URL. Navigating to /inbox,
		// /folder/*, etc. clears the chips; /search hydrates them from `q`.
		if (page.url.pathname === '/search') {
			searchQuery = page.url.searchParams.get('q') ?? '';
		} else {
			searchQuery = '';
		}
	});
	let profileOpen = $state(false);
	let profileCardEl = $state<HTMLDivElement | undefined>(undefined);
	let sidebarCollapsed = $state(false);

	const avatarLetter = $derived((data.displayName ?? 'O')[0].toUpperCase());
	const sidebarWidth = $derived(sidebarCollapsed ? '48px' : '224px');

	onMount(() => {
		// Phase 13: avatar / labels / signatures live server-side now.
		// Wipe leftover localStorage + cookie state from earlier phases on
		// the first load after deploy so stale browser data can't shadow
		// the canonical SQLite values.
		const PHASE_13_CLEARED_KEY = 'ameera.phase13.cleared';
		try {
			if (!localStorage.getItem(PHASE_13_CLEARED_KEY)) {
				localStorage.removeItem('profile_photo_v2');
				localStorage.removeItem('profile_photo');
				localStorage.removeItem('ameera_signature');
				localStorage.removeItem('label_meta');
				localStorage.removeItem('folder_meta');
				localStorage.setItem(PHASE_13_CLEARED_KEY, '1');
			}
		} catch {
			// Private mode / quota errors — best-effort.
		}
		document.cookie = 'label_meta=; Path=/; Max-Age=0';
		document.cookie = 'folder_meta=; Path=/; Max-Age=0';
		// Phase 15a: legacy plain-text signature cookie is replaced by the
		// SQLite-backed Signatures page. Wipe it so stale browser data
		// can't reappear in any future export.
		document.cookie = 'signature=; Path=/; Max-Age=0';

		loadUserState();
		profilePhoto.hydrate();
		const handler = () => readingPane.setFromViewport(window.innerWidth);
		window.addEventListener('resize', handler);

		// Real-time push: keep the SSE connection open for the lifetime of
		// the (app) layout. We deliberately don't disconnect on
		// `document.hidden` — screen lock, App Nap, Spaces switch, or just
		// looking away can flip visibility for arbitrary durations, and
		// the user expects new mail to be live the moment they look back,
		// not after a fresh handshake.
		realtime.connect();

		return () => {
			window.removeEventListener('resize', handler);
			realtime.disconnect();
			calendarNotify.stop();
		};
	});

	// Calendar push: poll CalDAV change tokens + VALARM reminders while any
	// notification channel is on. Reacts to settings changes live.
	$effect(() => {
		const wantsCalendar =
			data.notificationsEnabled && (data.notifyCalendarEvents || data.notifyEventReminders);
		if (wantsCalendar) {
			calendarNotify.start({
				newEvents: data.notifyCalendarEvents,
				reminders: data.notifyEventReminders
			});
			calendarNotify.setOptions({
				newEvents: data.notifyCalendarEvents,
				reminders: data.notifyEventReminders
			});
		} else {
			calendarNotify.stop();
		}
	});

	// Watch the inbox unread count for new mail. Kept as a plain `let`
	// (not `$state`) so writes don't re-trigger the effect that reads it.
	// `-1` is the "no baseline yet" sentinel — first effect run captures
	// the starting value without firing a toast.
	let lastInboxUnread = -1;

	$effect(() => {
		const inbox = data.mailboxes.find((m) => m.role === 'inbox');
		if (!inbox) return;

		const current = inbox.unreadEmails;
		if (lastInboxUnread === -1) {
			lastInboxUnread = current;
			return;
		}

		if (current > lastInboxUnread) {
			const delta = current - lastInboxUnread;
			const onInbox = page.url.pathname === '/inbox';

			if (!onInbox) {
				showToast({
					message: `${delta} new message${delta === 1 ? '' : 's'}`,
					action: { label: 'View', onClick: () => goto('/inbox') }
				});
			}

			if (
				data.notificationsEnabled &&
				typeof Notification !== 'undefined' &&
				Notification.permission === 'granted'
			) {
				new Notification(
					delta === 1 ? 'New message' : `${delta} new messages`,
					{ body: 'Your inbox has new mail.', tag: 'ameera-mail-new', silent: false }
				);
			}
		}

		lastInboxUnread = current;
	});

	function submitSearch(raw: string) {
		goto(`/search?q=${encodeURIComponent(raw)}`);
	}

	function handleClickOutside(e: MouseEvent) {
		if (profileOpen && profileCardEl && !profileCardEl.contains(e.target as Node)) {
			profileOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div
	class="h-screen overflow-hidden bg-surface grid grid-rows-[auto_1fr]"
	class:density-compact={data.density === 'compact'}
	style="grid-template-columns: {sidebarWidth} 1fr auto; transition: grid-template-columns 0.2s ease;
		{data.activeAccountColor ? `border-top: 2px solid ${data.activeAccountColor};` : ''}"
>
	<!-- Row 1: Full-width header -->
	<div class="col-span-3 flex items-center h-14 pl-4 pr-0 gap-4">
		<h1 class="text-lg font-bold text-text tracking-tight leading-none shrink-0 {sidebarCollapsed ? 'w-4' : 'w-[192px]'} transition-all duration-200 overflow-hidden whitespace-nowrap">
			{sidebarCollapsed ? '' : 'ameera.'}
		</h1>
		<SearchInput bind:value={searchQuery} onSubmit={submitSearch} mailboxes={data.mailboxes} />
		<div class="flex-1"></div>
		<ConnectionStatus />
		<div class="w-px h-5 bg-border shrink-0"></div>
		<span class="text-sm text-text-secondary select-none">{data.displayName}</span>
		<div class="w-px h-5 bg-border shrink-0"></div>
		<!-- 52px wrapper aligns avatar center with the AppRail column below -->
		<div class="w-[52px] shrink-0 flex items-center justify-center">
			<button
				onclick={(e) => { e.stopPropagation(); profileOpen = !profileOpen; }}
				class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold select-none shrink-0 cursor-pointer transition-shadow overflow-hidden"
				style={data.activeAccountColor
					? `background-color: ${data.activeAccountColor}; box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px ${data.activeAccountColor};`
					: ''}
				title="Accounts — {data.userEmail}"
			>
				{#if $profilePhoto.url}
					<img
						src={$profilePhoto.url}
						alt="Profile"
						class="w-full h-full object-cover origin-center pointer-events-none select-none"
						style="transform: translate({$profilePhoto.offsetX * (32 / 80)}px, {$profilePhoto.offsetY * (32 / 80)}px) scale({$profilePhoto.zoom});"
						draggable="false"
					/>
				{:else}
					{avatarLetter}
				{/if}
			</button>
		</div>
	</div>

	<!-- Row 2, Col 1: Sidebar -->
	<Sidebar
		mailboxes={data.mailboxes}
		labels={data.labels ?? []}
		folderExpanded={data.folderExpanded ?? {}}
		hideHeader={true}
		collapsed={sidebarCollapsed}
		onToggleCollapse={() => { sidebarCollapsed = !sidebarCollapsed; }}
	/>

	<!-- Row 2, Col 2: Main content -->
	<main class="overflow-hidden min-w-0 bg-bg rounded-tl-xl rounded-tr-xl">
		{@render children()}
	</main>

	<!-- Row 2, Col 3: App rail -->
	<AppRail />
</div>

{#if profileOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div bind:this={profileCardEl} class="fixed z-50" style="top: 56px; right: 64px;" onclick={(e) => e.stopPropagation()}>
		<ProfileCard
			displayName={data.displayName}
			email={data.userEmail}
			accounts={data.accounts ?? []}
			activeAccountId={data.activeAccountId ?? null}
			accountUnread={data.accountUnread ?? {}}
			onClose={() => { profileOpen = false; }}
		/>
	</div>
{/if}

<ComposerShell />
<ToastContainer />
