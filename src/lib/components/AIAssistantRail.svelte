<script lang="ts">
	import { tick } from 'svelte';

	type AgentAction =
		| 'chat'
		| 'summarize_today'
		| 'calendar_tomorrow'
		| 'summarize_current'
		| 'propose_task';
	type TaskProvider = 'todoist' | 'linear' | 'notion' | 'webhook';

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

	let input = $state('');
	let busy = $state(false);
	let error = $state('');
	let scrollEl = $state<HTMLDivElement | undefined>(undefined);
	let sequence = 0;
	let messages = $state<ChatMessage[]>([
		{
			id: 'welcome',
			role: 'assistant',
			content:
				'I can review your mail, check your calendar, and prepare tasks. I will always ask before creating anything.'
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

	async function ask(action: AgentAction, suggestedPrompt?: string) {
		const prompt = (suggestedPrompt ?? input).trim();
		if (busy || !prompt) return;

		const priorConversation = messages
			.filter((message) => message.id !== 'welcome')
			.slice(-12)
			.map((message) => ({ role: message.role, content: message.content }));
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
					conversation: priorConversation,
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
			messages = [
				...messages,
				{
					id: id(),
					role: 'assistant',
					content: data.message,
					proposal: data.taskProposal,
					taskProviders: providers,
					selectedProvider
				}
			];
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

<aside
	aria-label="AI mail agent"
	aria-hidden={!open}
	inert={!open}
	class="h-full min-w-[320px] w-[clamp(320px,28vw,400px)] overflow-hidden border-l border-border bg-surface transition-all duration-300 ease-out
		{open ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0 pointer-events-none'}"
>
	<div class="flex h-full min-h-0 flex-col">
		<header class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
			<div class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>
					<path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>
				</svg>
				<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-surface {aiEnabled ? 'bg-success' : 'bg-text-tertiary'}"></span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-sm font-semibold text-text">AI Mail Agent</h2>
				<p class="truncate text-[11px] text-text-tertiary">
					{aiEnabled ? (currentEmailId ? 'Current email in context' : 'Mailbox assistant') : 'AI service not configured'}
				</p>
			</div>
			<button type="button" onclick={onClose} class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text" aria-label="Close AI mail agent">
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
			</button>
		</header>

		<div bind:this={scrollEl} class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
			{#each messages as message (message.id)}
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-5
						{message.role === 'user'
							? 'rounded-br-md bg-accent text-white'
							: 'rounded-bl-md border border-border bg-bg text-text'}">
						<p class="whitespace-pre-wrap">{message.content}</p>
						{#if message.link}
							<a href={message.link} target="_blank" rel="noreferrer" class="mt-2 inline-flex text-xs font-medium text-accent hover:underline">Open task &nearr;</a>
						{/if}
						{#if message.proposal}
							<div class="mt-3 rounded-xl border border-border bg-surface p-3 text-text">
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
					<button type="button" onclick={() => ask('summarize_today', "Summarize today's email and highlight anything that needs my attention.")} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-bg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
						<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16v16H4zM8 9h8M8 13h6M8 17h4"/></svg>
						</span>
						<span class="block text-xs font-medium text-text">Today’s mail</span>
						<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Summary and priorities</span>
					</button>
					<button type="button" onclick={() => ask('calendar_tomorrow', "Check my calendar for tomorrow and help me prepare.")} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-bg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
						<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>
						</span>
						<span class="block text-xs font-medium text-text">Tomorrow</span>
						<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Calendar briefing</span>
					</button>
					{#if currentEmailId}
						<button type="button" onclick={() => ask('summarize_current', 'Summarize this email and tell me what I need to do.')} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-bg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
							<span class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
								<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
							</span>
							<span class="block text-xs font-medium text-text">This email</span>
							<span class="mt-0.5 block text-[10px] leading-4 text-text-tertiary">Summary and actions</span>
						</button>
					{/if}
					<button type="button" onclick={() => ask('propose_task', 'Create a task from this conversation and the relevant email context.')} disabled={busy || !aiEnabled} class="group cursor-pointer rounded-xl border border-border bg-bg p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm disabled:cursor-default disabled:opacity-50">
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
					<div class="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-bg px-4 py-3" aria-label="AI mail agent is thinking">
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]"></span>
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]"></span>
					</div>
				</div>
			{/if}
		</div>

		<div class="shrink-0 border-t border-border p-3">
			{#if error}
				<p class="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
			{/if}
			{#if !aiEnabled}
				<p class="mb-2 text-xs text-text-tertiary">Set OLLAMA_URL or OLLAMA_API_KEY to enable the agent.</p>
			{/if}
			<form class="flex items-end gap-2 rounded-2xl border border-border bg-bg p-2 transition-colors focus-within:border-accent/60" onsubmit={(event) => { event.preventDefault(); ask('chat'); }}>
				<textarea bind:value={input} rows="1" maxlength="1500" placeholder="Ask about your mail…" disabled={busy || !aiEnabled} onkeydown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask('chat'); } }} class="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text outline-none placeholder:text-text-tertiary disabled:opacity-50"></textarea>
				<button type="submit" disabled={busy || !aiEnabled || !input.trim()} aria-label="Send message" class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent text-white transition-all hover:bg-accent-hover disabled:cursor-default disabled:opacity-40">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
				</button>
			</form>
			<p class="mt-2 text-center text-[10px] text-text-tertiary">Mail content is shared only with your configured AI service.</p>
		</div>
	</div>
</aside>
