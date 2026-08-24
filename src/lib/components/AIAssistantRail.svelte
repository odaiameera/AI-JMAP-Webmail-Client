<script lang="ts">
	import { tick } from 'svelte';

	type AgentAction =
		| 'chat'
		| 'summarize_today'
		| 'calendar_tomorrow'
		| 'summarize_current'
		| 'propose_task';
	type TaskProvider = 'todoist' | 'linear' | 'notion' | 'webhook';

	type SessionSummary = {
		id: string;
		title: string;
		createdAt: number;
		updatedAt: number;
		messageCount: number;
	};

	type TaskProposal = {
		title: string;
		description: string;
		dueDate: string | null;
		destination: 'todoist' | 'linear' | 'notion' | null;
	};

	type ChatMessage = {
		id: string;
		role: 'assistant' | 'user';
		content: string;
		/** Sanitised HTML for assistant replies; plain `content` is the fallback. */
		html?: string;
		proposal?: TaskProposal;
		taskProviders?: TaskProvider[];
		selectedProvider?: TaskProvider;
		taskStatus?: 'creating' | 'created' | 'failed';
		link?: string;
	};

	let {
		open,
		aiEnabled,
		currentEmailId = null,
		onClose
	}: {
		open: boolean;
		aiEnabled: boolean;
		currentEmailId?: string | null;
		onClose: () => void;
	} = $props();

	const WELCOME =
		'I can search your whole mailbox, check your calendar, and prepare tasks. Ask me anything — I will always ask before creating anything.';

	let input = $state('');
	let busy = $state(false);
	let error = $state('');
	let scrollEl = $state<HTMLDivElement | undefined>(undefined);
	let sequence = 0;

	/**
	 * The server owns the transcript. This is null until the first reply comes
	 * back, which is when the session is created and named.
	 */
	let conversationId = $state<string | null>(null);
	let sessions = $state<SessionSummary[]>([]);
	let historyOpen = $state(false);
	let loadingHistory = $state(false);
	let retentionDays = $state(7);
	let messages = $state<ChatMessage[]>([
		{
			id: 'welcome',
			role: 'assistant',
			content: WELCOME
		}
	]);

	const hasConversation = $derived(messages.some((message) => message.role === 'user'));

	function id(): string {
		sequence += 1;
		return `agent-${Date.now()}-${sequence}`;
	}

	function dayRange(offset: number): { start: string; end: string } {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		start.setDate(start.getDate() + offset);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return { start: start.toISOString(), end: end.toISOString() };
	}

	async function scrollToLatest() {
		await tick();
		scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
	}

	function relativeTime(timestamp: number): string {
		const minutes = Math.round((Date.now() - timestamp) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.round(hours / 24)}d ago`;
	}

	async function loadSessions() {
		loadingHistory = true;
		try {
			const response = await fetch('/api/ai/conversations');
			const data = (await response.json().catch(() => null)) as {
				conversations?: SessionSummary[];
				retentionDays?: number;
			} | null;
			if (response.ok) {
				sessions = data?.conversations ?? [];
				retentionDays = data?.retentionDays ?? retentionDays;
			}
		} catch {
			// A history list that will not load should not break the chat
			// itself; the panel just shows no past sessions.
		} finally {
			loadingHistory = false;
		}
	}

	function startNewChat() {
		conversationId = null;
		historyOpen = false;
		error = '';
		messages = [{ id: 'welcome', role: 'assistant', content: WELCOME }];
	}

	async function openSession(sessionId: string) {
		historyOpen = false;
		error = '';
		busy = true;
		try {
			const response = await fetch(`/api/ai/conversations/${encodeURIComponent(sessionId)}`);
			const data = (await response.json().catch(() => null)) as {
				messages?: { id: string; role: 'user' | 'assistant'; content: string; html: string }[];
				error?: string;
			} | null;
			if (!response.ok) throw new Error(data?.error ?? 'That conversation could not be opened');

			conversationId = sessionId;
			messages = (data?.messages ?? []).map((message) => ({
				id: message.id,
				role: message.role,
				content: message.content,
				html: message.html || undefined
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'That conversation could not be opened';
		} finally {
			busy = false;
			await scrollToLatest();
		}
	}

	async function removeSession(sessionId: string) {
		try {
			const response = await fetch(`/api/ai/conversations/${encodeURIComponent(sessionId)}`, {
				method: 'DELETE'
			});
			if (!response.ok) return;
			sessions = sessions.filter((session) => session.id !== sessionId);
			// Deleting the open session leaves the panel showing a transcript
			// that no longer exists, so reset to a fresh one.
			if (conversationId === sessionId) startNewChat();
		} catch {
			// Leave the row in place; a retry is one click away.
		}
	}

	// Refresh the session list whenever the panel is opened, so it reflects
	// conversations held in another tab or on another device.
	$effect(() => {
		if (open) void loadSessions();
	});

	async function ask(action: AgentAction, suggestedPrompt?: string) {
		const prompt = (suggestedPrompt ?? input).trim();
		if (busy || !prompt) return;

		messages = [...messages, { id: id(), role: 'user', content: prompt }];
		input = '';
		busy = true;
		error = '';
		await scrollToLatest();

		const today = dayRange(0);
		const tomorrow = dayRange(1);

		try {
			const response = await fetch('/api/ai/agent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					message: prompt,
					// The transcript itself lives on the server; this only says
					// which one to continue.
					conversationId,
					currentEmailId,
					timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					todayStart: today.start,
					todayEnd: today.end,
					tomorrowStart: tomorrow.start,
					tomorrowEnd: tomorrow.end
				})
			});
			const data = (await response.json().catch(() => null)) as {
				message?: string;
				html?: string;
				conversationId?: string;
				error?: string;
				taskProposal?: TaskProposal;
				taskProviders?: TaskProvider[];
			} | null;
			if (!response.ok || !data?.message) {
				throw new Error(data?.error ?? 'The mail agent could not answer');
			}
			const providers = data.taskProviders ?? [];
			const preferred = data.taskProposal?.destination ?? undefined;
			const selectedProvider =
				preferred && providers.includes(preferred) ? preferred : providers[0];
			// The first reply is what creates the session, so adopt the id the
			// server assigned and refresh the list it now appears in.
			if (data.conversationId && data.conversationId !== conversationId) {
				conversationId = data.conversationId;
			}
			messages = [
				...messages,
				{
					id: id(),
					role: 'assistant',
					content: data.message,
					html: data.html,
					proposal: data.taskProposal,
					taskProviders: providers,
					selectedProvider
				}
			];
			void loadSessions();
		} catch (err) {
			error = err instanceof Error ? err.message : 'The mail agent could not answer';
		} finally {
			busy = false;
			await scrollToLatest();
		}
	}

	function selectProvider(messageId: string, provider: TaskProvider) {
		messages = messages.map((message) =>
			message.id === messageId ? { ...message, selectedProvider: provider } : message
		);
	}

	function providerLabel(provider: TaskProvider): string {
		if (provider === 'webhook') return 'Webhook';
		return provider[0].toUpperCase() + provider.slice(1);
	}

	async function createTask(messageId: string, proposal: TaskProposal, provider: TaskProvider) {
		messages = messages.map((message) =>
			message.id === messageId ? { ...message, taskStatus: 'creating' } : message
		);
		error = '';
		try {
			const response = await fetch('/api/ai/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmed: true, task: proposal, provider })
			});
			const data = (await response.json().catch(() => null)) as {
				message?: string;
				error?: string;
				url?: string;
			} | null;
			if (!response.ok) throw new Error(data?.error ?? 'The task could not be created');
			messages = messages.map((message) =>
				message.id === messageId ? { ...message, taskStatus: 'created' } : message
			);
			messages = [
				...messages,
				{
					id: id(),
					role: 'assistant',
					content: data?.message ?? 'Task created.',
					link: data?.url
				}
			];
		} catch (err) {
			messages = messages.map((message) =>
				message.id === messageId ? { ...message, taskStatus: 'failed' } : message
			);
			error = err instanceof Error ? err.message : 'The task could not be created';
		} finally {
			await scrollToLatest();
		}
	}
</script>

<!--
	Drawer over the reading pane, not a column beside it. The parent is a
	zero-width grid column sitting on the reading-pane/app-rail boundary, so
	`inset-y-0 right-0` pins the drawer to that edge at full row height and its
	own width expands leftward across the pane underneath.

	z-[35] clears in-pane dropdowns (z-30) while staying under the composer
	backdrop (z-40). While closed, `pointer-events-none` lets clicks reach the
	reading pane it covers.
-->
<aside
	aria-label="AI mail agent"
	aria-hidden={!open}
	inert={!open}
	class="absolute inset-y-0 right-0 z-[35] min-w-[320px] w-[clamp(320px,28vw,400px)] overflow-hidden border-l border-border bg-bg shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out
		{open ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0 pointer-events-none'}"
>
	<div class="flex h-full min-h-0 flex-col">
		<header class="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
			<div class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
				<!-- Same robot head as the app rail's AI item: one feature, one symbol. -->
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 8V4H8"/>
					<rect width="16" height="12" x="4" y="8" rx="2"/>
					<path d="M2 14h2"/><path d="M20 14h2"/>
					<path d="M15 13v2"/><path d="M9 13v2"/>
				</svg>
				<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-surface {aiEnabled ? 'bg-success' : 'bg-text-tertiary'}"></span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-sm font-semibold text-text">AI Mail Agent</h2>
				<p class="truncate text-[11px] text-text-tertiary">
					{aiEnabled ? (currentEmailId ? 'Current email in context' : 'Mailbox assistant') : 'AI service not configured'}
				</p>
			</div>
			<!--
				Separates the panel's identity from its controls. The drawer now
				shares the reading pane's background, so grouping inside the
				header has to come from a rule rather than a change of shade.
			-->
			<span class="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true"></span>
			<button
				type="button"
				onclick={startNewChat}
				class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text"
				aria-label="New conversation"
				title="New conversation"
			>
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
			</button>
			<button
				type="button"
				onclick={() => { historyOpen = !historyOpen; }}
				class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-surface-hover hover:text-text {historyOpen ? 'bg-surface-hover text-text' : 'text-text-tertiary'}"
				aria-label="Conversation history"
				aria-pressed={historyOpen}
				title="Conversation history"
			>
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
			</button>
			<button type="button" onclick={onClose} class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text" aria-label="Close AI mail agent">
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
			</button>
		</header>

		{#if historyOpen}
			<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				<p class="px-1 pb-2 text-[11px] text-text-tertiary">
					Conversations are kept for {retentionDays} days.
				</p>

				{#if loadingHistory && !sessions.length}
					<p class="px-1 text-xs text-text-tertiary">Loading…</p>
				{:else if !sessions.length}
					<p class="px-1 text-xs text-text-tertiary">No past conversations yet.</p>
				{:else}
					<ul class="space-y-1">
						{#each sessions as session (session.id)}
							<li class="group flex items-center gap-1 rounded-lg {session.id === conversationId ? 'bg-surface-hover' : 'hover:bg-surface-hover'}">
								<button
									type="button"
									onclick={() => openSession(session.id)}
									class="min-w-0 flex-1 cursor-pointer px-2.5 py-2 text-left"
								>
									<span class="block truncate text-xs font-medium text-text">{session.title}</span>
									<span class="block text-[11px] text-text-tertiary">
										{relativeTime(session.updatedAt)} · {session.messageCount} message{session.messageCount === 1 ? '' : 's'}
									</span>
								</button>
								<button
									type="button"
									onclick={() => removeSession(session.id)}
									class="mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
									aria-label="Delete conversation {session.title}"
								>
									<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
		<div bind:this={scrollEl} class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
			{#each messages as message (message.id)}
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-5
						{message.role === 'user'
							? 'rounded-br-md bg-accent text-white'
							: 'rounded-bl-md border border-border bg-surface text-text'}">
						{#if message.html}
							<!-- Sanitised on the server by renderAgentMarkdown; see
							     src/lib/server/ai/markdown.ts for the allowlist. -->
							<div class="agent-markdown">{@html message.html}</div>
						{:else}
							<p class="whitespace-pre-wrap">{message.content}</p>
						{/if}
						{#if message.link}
							<a href={message.link} target="_blank" rel="noreferrer" class="mt-2 inline-flex text-xs font-medium text-accent hover:underline">Open task &nearr;</a>
						{/if}
						{#if message.proposal}
							<div class="mt-3 rounded-xl border border-border bg-bg p-3 text-text">
								<p class="text-[10px] font-semibold uppercase tracking-wider text-accent">Task proposal</p>
								<p class="mt-1 font-medium">{message.proposal.title}</p>
								{#if message.proposal.description}
									<p class="mt-1 text-xs text-text-secondary">{message.proposal.description}</p>
								{/if}
								{#if message.proposal.dueDate}
									<p class="mt-2 text-xs text-text-tertiary">Due {message.proposal.dueDate}</p>
								{/if}
								{#if message.taskProviders?.length}
									<div class="mt-3 flex flex-wrap gap-1.5" aria-label="Task destination">
										{#each message.taskProviders as provider (provider)}
											<button
												type="button"
												onclick={() => selectProvider(message.id, provider)}
												class="cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors
													{message.selectedProvider === provider
														? 'border-accent bg-accent/10 text-accent'
														: 'border-border text-text-secondary hover:border-accent/50'}"
											>
												{providerLabel(provider)}
											</button>
										{/each}
									</div>
								{/if}
								<button
									type="button"
									disabled={!message.selectedProvider || message.taskStatus === 'creating' || message.taskStatus === 'created'}
									onclick={() => createTask(message.id, message.proposal!, message.selectedProvider!)}
									class="mt-3 w-full cursor-pointer rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-default disabled:opacity-60"
								>
									{!message.selectedProvider
										? 'No task app connected'
										: message.taskStatus === 'creating'
										? 'Creating…'
										: message.taskStatus === 'created'
											? 'Created'
											: message.taskStatus === 'failed'
												? 'Try again'
												: `Confirm in ${providerLabel(message.selectedProvider)}`}
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if !hasConversation}
				<div class="grid grid-cols-2 gap-2 pt-1">
					<button type="button" onclick={() => ask('summarize_today', "Summarize today's email and highlight anything that needs my attention.")} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
						<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16v16H4zM8 9h8M8 13h6M8 17h4"/></svg>
						</span>
						<span class="block text-xs font-medium text-text">Today’s mail</span>
						<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Summary and priorities</span>
					</button>
					<button type="button" onclick={() => ask('calendar_tomorrow', "Check my calendar for tomorrow and help me prepare.")} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
						<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
						</span>
						<span class="block text-xs font-medium text-text">Tomorrow</span>
						<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Calendar briefing</span>
					</button>
					{#if currentEmailId}
						<button type="button" onclick={() => ask('summarize_current', 'Summarize this email and tell me what I need to do.')} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
							<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
								<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
							</span>
							<span class="block text-xs font-medium text-text">This email</span>
							<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Summary and actions</span>
						</button>
					{/if}
					<button type="button" onclick={() => ask('propose_task', 'Create a task from this conversation and the relevant email context.')} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
						<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
						</span>
						<span class="block text-xs font-medium text-text">Create task</span>
						<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Review before creating</span>
					</button>
				</div>
			{/if}

			{#if busy}
				<div class="flex justify-start">
					<div class="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3" aria-label="AI mail agent is thinking">
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]"></span>
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]"></span>
					</div>
				</div>
			{/if}
		</div>
		{/if}

		<div class="shrink-0 border-t border-border p-3">
			{#if error}
				<p class="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
			{/if}
			{#if !aiEnabled}
				<p class="mb-2 text-xs text-text-tertiary">Set OLLAMA_URL or OLLAMA_API_KEY to enable the agent.</p>
			{/if}
			<form class="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 transition-colors focus-within:border-accent/60" onsubmit={(event) => { event.preventDefault(); ask('chat'); }}>
				<textarea bind:value={input} rows="1" maxlength="1500" placeholder="Ask about your mail…" disabled={busy || !aiEnabled} onkeydown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask('chat'); } }} class="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text outline-none placeholder:text-text-tertiary disabled:opacity-50"></textarea>
				<button type="submit" disabled={busy || !aiEnabled || !input.trim()} aria-label="Send message" class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent text-white transition-all hover:bg-accent-hover disabled:cursor-default disabled:opacity-40">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
				</button>
			</form>
			<p class="mt-2 text-center text-[10px] text-text-tertiary">Mail content is shared only with your configured AI service.</p>
		</div>
	</div>
</aside>

<style>
	/*
	 * Assistant replies are injected with {@html}, which Svelte's style
	 * scoping does not reach — hence :global. Sizes stay close to the
	 * surrounding chat text so a formatted reply reads as part of the
	 * conversation rather than as an embedded document.
	 */
	.agent-markdown :global(> :first-child) {
		margin-top: 0;
	}
	.agent-markdown :global(> :last-child) {
		margin-bottom: 0;
	}
	.agent-markdown :global(p) {
		margin: 0.5rem 0;
	}
	.agent-markdown :global(ul),
	.agent-markdown :global(ol) {
		margin: 0.5rem 0;
		padding-left: 1.15rem;
	}
	.agent-markdown :global(ul) {
		list-style: disc;
	}
	.agent-markdown :global(ol) {
		list-style: decimal;
	}
	.agent-markdown :global(li) {
		margin: 0.2rem 0;
	}
	.agent-markdown :global(h3),
	.agent-markdown :global(h4),
	.agent-markdown :global(h5),
	.agent-markdown :global(h6) {
		margin: 0.75rem 0 0.35rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.agent-markdown :global(code) {
		border-radius: 0.25rem;
		background: color-mix(in srgb, currentColor 10%, transparent);
		padding: 0.1em 0.32em;
		font-size: 0.9em;
	}
	.agent-markdown :global(pre) {
		margin: 0.5rem 0;
		border-radius: 0.5rem;
		background: color-mix(in srgb, currentColor 10%, transparent);
		padding: 0.6rem 0.7rem;
		/* Long lines scroll inside the bubble instead of widening the panel. */
		overflow-x: auto;
	}
	.agent-markdown :global(pre code) {
		background: none;
		padding: 0;
	}
	.agent-markdown :global(blockquote) {
		margin: 0.5rem 0;
		border-left: 2px solid color-mix(in srgb, currentColor 30%, transparent);
		padding-left: 0.6rem;
		opacity: 0.85;
	}
	.agent-markdown :global(a) {
		/*
		 * Inherit rather than take the UA's link blue, which is unreadable on
		 * the dark assistant bubble and clashes on the accent-coloured user
		 * one. The underline carries the affordance in both.
		 */
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.agent-markdown :global(hr) {
		margin: 0.75rem 0;
		border: 0;
		border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
	}
	.agent-markdown :global(table) {
		margin: 0.5rem 0;
		display: block;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}
	.agent-markdown :global(th),
	.agent-markdown :global(td) {
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		padding: 0.25rem 0.45rem;
		text-align: left;
	}
	.agent-markdown :global(strong) {
		font-weight: 600;
	}
</style>
