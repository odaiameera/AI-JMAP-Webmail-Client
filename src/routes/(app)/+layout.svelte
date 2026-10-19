<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import AIAssistantRail from '$lib/components/AIAssistantRail.svelte';
	import ComposerShell from '$lib/components/composer/ComposerShell.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import { goto, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { isPhone } from '$lib/stores/viewport';
	import { openCompose } from '$lib/stores/compose';
	import { onMount, setContext, type Snippet } from 'svelte';
	import { APP_PANEL, type AppPanelContext } from '$lib/app-panel';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import { profilePhoto } from '$lib/stores/profilePhoto';
	import { realtime } from '$lib/stores/realtime';
	import { calendarNotify } from '$lib/stores/calendarNotify';
	import { showToast } from '$lib/stores/toast';
	import { loadUserState } from '$lib/stores/userState';
	import { AI_ASSISTANT_CONTEXT, type AIAssistantContext } from '$lib/types/assistant';
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
	let assistantOpen = $state(page.url.searchParams.get('assistant') === 'open');
	let currentEmailId = $state<string | null>(null);
	setContext<AIAssistantContext>(AI_ASSISTANT_CONTEXT, {
		open: () => { assistantOpen = true; },
		setCurrentEmail: (id) => { currentEmailId = id; },
		clearCurrentEmail: (id) => {
			if (currentEmailId === id) currentEmailId = null;
		}
	});

	const avatarLetter = $derived((data.displayName ?? 'O')[0].toUpperCase());
	// An account's colour (the stripe along the top, the avatar and its ring)
	// is there to tell linked accounts apart. With only one it is just a
	// second accent competing with the real one, so it waits for a second.
	const accountColor = $derived(
		(data.accounts?.length ?? 0) > 1 ? (data.activeAccountColor ?? null) : null
	);

	// The left column is the open app's own navigation (see $lib/app-panel):
	// folders anywhere in Mail, otherwise whatever panel the page hosts, and
	// nothing but a gutter for a page that hosts none.
	let appPanel = $state.raw<Snippet | null>(null);
	// Ownership is checked against a plain variable, not the state. Going
	// from one panel-hosting page to another (Calendar → Contacts), the new
	// page registers before the old one's onDestroy runs, and inside that
	// navigation's update the state can still read as the old panel — so a
	// check against it cleared the panel that had just been set.
	let ownPanel: Snippet | null = null;
	setContext<AppPanelContext>(APP_PANEL, {
		set: (panel) => { ownPanel = panel; appPanel = panel; },
		clear: (panel) => {
			if (ownPanel !== panel) return;
			ownPanel = null;
			appPanel = null;
		},
		closeDrawer: () => { drawerOpen = false; }
	});
	const inMail = $derived(/^\/(inbox|folder|email|search|flagged)(\/|$)/.test(page.url.pathname));
	// Apps that always host a panel get their column from the start. The
	// shell's own markup (the column width) is written before the page has
	// registered its panel, so going by `appPanel` alone rendered these
	// pages with no column on a full load, and the panel slid in only once
	// the page's script ran.
	const panelRoute = $derived(/^\/(calendar|contacts|settings)(\/|$)/.test(page.url.pathname));
	const panelKind = $derived<'mail' | 'app' | 'none'>(
		inMail ? 'mail' : appPanel || panelRoute ? 'app' : 'none'
	);
	const railCollapsed = $derived(panelKind === 'mail' && sidebarCollapsed);
	// Only the mail sidebar collapses to an icon strip; app panels are
	// always full width.
	const sidebarWidth = $derived(
		panelKind === 'mail' ? (sidebarCollapsed ? '48px' : '224px') : panelKind === 'app' ? '224px' : '8px'
	);

	// Phone layout: the left column becomes a drawer opened from the header,
	// and it closes itself once you pick somewhere to go.
	let drawerOpen = $state(false);
	afterNavigate(() => { drawerOpen = false; });
	// Mail lists, where the phone layout floats a Compose button. Not an open
	// message: there the button would sit on top of the text being read.
	const onMailRoute = $derived(
		/^\/(inbox|folder|search|flagged)(\/|$)/.test(page.url.pathname)
	);

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

		// Offer this app as the system handler for mailto: links, so it can be
		// set as the default mail app the way Gmail/Outlook web can. Browsers
		// gate this behind a user gesture / prior engagement and only prompt
		// once, so a quiet best-effort call here is enough.
		try {
			navigator.registerProtocolHandler?.('mailto', '/mailto?to=%s');
		} catch {
			// Unsupported browser or blocked by policy — non-fatal.
		}

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

<!--
	Two layouts from one grid. From `md` up: header across the top, then
	sidebar | content | agent anchor | app rail. Below `md` (phones): a single
	column of header, content, and the app rail turned into a bottom tab bar;
	the sidebar leaves the grid as a slide-in drawer and the agent drawer goes
	full-width. The desktop columns ride in a custom property so the same
	element can drop them below `md` — an inline grid-template-columns would
	win over any class.
-->
<div
	class="h-dvh overflow-hidden bg-surface grid grid-cols-1 grid-rows-[auto_1fr_auto] md:grid-rows-[auto_1fr] md:[grid-template-columns:var(--shell-cols)]"
	class:density-compact={data.density === 'compact'}
	style="--shell-cols: {sidebarWidth} minmax(0, 1fr) 0px 52px; transition: grid-template-columns 0.3s ease;
		{accountColor ? `border-top: 2px solid ${accountColor};` : ''}"
>
	<!-- Row 1: Full-width header -->
	<div class="col-span-full flex items-center h-14 pl-2 md:pl-4 pr-0 gap-2 md:gap-4">
		<button
			type="button"
			onclick={() => { drawerOpen = true; }}
			class="md:hidden w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer {panelKind === 'none' ? 'invisible' : ''}"
			aria-label="Open menu"
			aria-expanded={drawerOpen}
		>
			<Icon name="menu" size={20} />
		</button>
		<h1 class="max-md:hidden text-lg font-bold text-text tracking-tight leading-none shrink-0 {railCollapsed ? 'w-4' : 'w-[192px]'} transition-all duration-200 overflow-hidden whitespace-nowrap">
			{railCollapsed ? '' : 'ameera.'}
		</h1>
		<SearchInput bind:value={searchQuery} onSubmit={submitSearch} mailboxes={data.mailboxes} />
		<!-- On phones the search box takes this space instead. -->
		<div class="flex-1 max-md:hidden"></div>
		<!-- 52px wrapper aligns avatar center with the AppRail column below -->
		<div class="w-[52px] shrink-0 flex items-center justify-center">
			<button
				onclick={(e) => { e.stopPropagation(); profileOpen = !profileOpen; }}
				class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold select-none shrink-0 cursor-pointer transition-shadow overflow-hidden"
				style={accountColor
					? `background-color: ${accountColor}; box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px ${accountColor};`
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

	<!--
		Row 2, Col 2: Main content — the tray.

		Mail list and reading pane sit on --color-bg, rounded on all four
		corners and inset from the bottom of the window so the chrome colour
		shows beneath. The chrome around it (sidebar, app rail, header) stays on
		--color-surface and runs to the window edge.

		Note the direction: under the Primer palette the CHROME is the recessed
		tone and the CONTENT is the raised one — #010409 chrome under a #0d1117
		tray in dark, #f6f8fa chrome under a #ffffff tray in light. That is
		GitHub's own model, where the global header and sidebars sit behind the
		page rather than above it, and it holds in both themes. (It is the
		reverse of what this app did before, when the content was the darker
		tone; if the tray ever stops reading as raised, that inversion is the
		first thing to check.)

		Only the bottom is inset: left and right already meet the chrome, so the
		corners alone separate them.
	-->
	<main class="row-start-2 md:col-start-2 md:mb-2 overflow-hidden min-w-0 min-h-0 bg-bg md:rounded-xl">
		{@render children()}
	</main>

	<!-- Row 2, Col 1: the open app's navigation — after <main> in the DOM so
	     the page has registered its panel (if any) before this renders; grid
	     placement puts it back on the left. `md:contents` keeps the panel
	     itself as the grid item on desktop; on phones this wrapper is the
	     drawer. The mail sidebar's collapse button closes the drawer there,
	     since a 48px icon strip makes no sense as an overlay. -->
	{#if drawerOpen}
		<button
			type="button"
			class="md:hidden fixed inset-0 z-40 bg-black/50 animate-compose-backdrop-in cursor-default"
			aria-label="Close menu"
			onclick={() => { drawerOpen = false; }}
		></button>
	{/if}
	{#if panelKind !== 'none'}
		<div
			class="md:contents max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[280px] max-md:max-w-[85vw] max-md:bg-surface max-md:shadow-2xl max-md:transition-[transform,visibility] max-md:duration-200
				{drawerOpen ? '' : 'max-md:-translate-x-full max-md:invisible'}"
		>
			<div class="md:col-start-1 md:row-start-2 h-full min-h-0 overflow-hidden">
				{#if panelKind === 'mail'}
					<Sidebar
						mailboxes={data.mailboxes}
						labels={data.labels ?? []}
						folderExpanded={data.folderExpanded ?? {}}
						hideHeader={!$isPhone}
						collapsed={sidebarCollapsed && !$isPhone}
						onToggleCollapse={() => {
							if ($isPhone) drawerOpen = false;
							else sidebarCollapsed = !sidebarCollapsed;
						}}
					/>
				{:else if appPanel}
					<div class="h-full flex flex-col bg-surface">
						{#if $isPhone}
							<div class="px-4 py-3"><span class="text-lg font-bold text-text tracking-tight leading-none">ameera.</span></div>
						{/if}
						{@render appPanel()}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!--
		Row 2, Col 3: AI agent drawer anchor.

		This column is pinned to 0px so opening the agent never resizes the
		reading pane. It survives only as a positioning reference: it sits
		exactly on the boundary between the reading pane and the app rail, so
		the drawer inside it anchors to `right: 0` and expands leftward over
		the reading pane. Height comes from the row, so the drawer needs no
		hard-coded header offset.
	-->
	<!-- On phones the anchor is pinned to the screen's right edge between
	     the header and the tab bar, and the drawer goes full-width. -->
	<div class="relative md:col-start-3 md:row-start-2 md:mb-2 max-md:fixed max-md:right-0 max-md:top-14 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
		<AIAssistantRail
			open={assistantOpen}
			aiEnabled={data.aiEnabled}
			{currentEmailId}
			onClose={() => { assistantOpen = false; }}
		/>
	</div>

	<!-- Row 2, Col 4: App rail (row 3 — the bottom tab bar — on phones) -->
	<AppRail
		aiOpen={assistantOpen}
		aiEnabled={data.aiEnabled}
		onToggleAI={() => { assistantOpen = !assistantOpen; }}
	/>
</div>

<!-- Phones have no sidebar on screen, so mail gets a floating Compose
     button, lifted clear of the tab bar and the list's pager above it. -->
{#if onMailRoute}
	<button
		type="button"
		onclick={() => openCompose()}
		class="md:hidden fixed right-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-30 h-14 w-14 rounded-2xl bg-accent hover:bg-accent-hover text-white shadow-lg flex items-center justify-center cursor-pointer transition-colors"
		aria-label="Compose"
	>
		<Icon name="compose" size={20} />
	</button>
{/if}

{#if profileOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div bind:this={profileCardEl} class="fixed z-50 top-14 right-2 md:right-16" onclick={(e) => e.stopPropagation()}>
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
