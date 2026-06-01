<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { slide, fade, fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import type { Rule, RuleAction } from '$lib/types/rules';
	import { LABEL_PREFIX } from '$lib/types/labels';

	let { data }: { data: PageData } = $props();

	// Working copy. Edits here stay local until the user hits Save.
	let localRules = $state<Rule[]>(structuredClone(data.rules ?? []));
	let selectedId = $state<string | null>(data.rules[0]?.id ?? null);

	const selectedIdx = $derived(localRules.findIndex((r) => r.id === selectedId));

	// Sort user folders (moveToFolder targets) and labels once.
	const folderOptions = $derived(
		data.mailboxes
			.filter((m) => m.role === null && !m.name.startsWith(LABEL_PREFIX))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const systemFolderOptions = $derived(
		data.mailboxes.filter((m) => m.role === 'archive' || m.role === 'junk' || m.role === 'trash')
	);
	const labelOptions = $derived(data.labels);

	// --- Save / deploy ---

	let saving = $state(false);
	let deployError = $state('');
	let savedToast = $state(false);

	async function persistAll(): Promise<boolean> {
		saving = true;
		deployError = '';
		try {
			await fetch('/api/preferences/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: localRules })
			});
			const deployRes = await fetch('/api/rules/deploy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: localRules })
			});
			const deployData = await deployRes.json();
			if (deployData.error) {
				deployError = deployData.error;
				return false;
			}
			await invalidateAll();
			return true;
		} catch (err) {
			deployError = err instanceof Error ? err.message : 'Save failed';
			return false;
		} finally {
			saving = false;
		}
	}

	async function saveOnly() {
		const ok = await persistAll();
		if (ok) {
			savedToast = true;
			setTimeout(() => { savedToast = false; }, 1600);
		}
	}

	// --- Rule CRUD in the list ---

	function newRuleId(): string {
		return 'rule_' + Math.random().toString(36).slice(2) + '_' + Date.now();
	}

	async function createRule() {
		const rule: Rule = {
			id: newRuleId(),
			name: 'New rule',
			enabled: true,
			logic: 'allof',
			conditions: [{ id: 'c_' + Date.now(), field: 'from', op: 'contains', value: '', negate: false }],
			actions: [{ type: 'applyLabel' }],
			createdAt: Date.now()
		};
		localRules = [...localRules, rule];
		selectedId = rule.id;
		await persistAll();
	}

	async function toggleEnabled(id: string) {
		localRules = localRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
		await persistAll();
	}

	async function deleteRule(id: string) {
		const r = localRules.find((x) => x.id === id);
		if (!r) return;
		if (!confirm(`Delete rule "${r.name}"? This cannot be undone.`)) return;
		localRules = localRules.filter((x) => x.id !== id);
		if (selectedId === id) selectedId = localRules[0]?.id ?? null;
		await persistAll();
	}

	// --- Editor mutations (selected rule) ---

	function addCondition() {
		if (selectedIdx < 0) return;
		localRules[selectedIdx].conditions = [
			...localRules[selectedIdx].conditions,
			{ id: 'c_' + Date.now(), field: 'from', op: 'contains', value: '', negate: false }
		];
	}
	function removeCondition(cid: string) {
		if (selectedIdx < 0) return;
		localRules[selectedIdx].conditions = localRules[selectedIdx].conditions.filter((c) => c.id !== cid);
	}
	function addAction() {
		if (selectedIdx < 0) return;
		localRules[selectedIdx].actions = [...localRules[selectedIdx].actions, { type: 'markRead' } as RuleAction];
	}
	function removeAction(idx: number) {
		if (selectedIdx < 0) return;
		localRules[selectedIdx].actions = localRules[selectedIdx].actions.filter((_, i) => i !== idx);
	}

	// --- Live match preview ---

	let previewCount = $state<number | null>(null);
	let previewLoading = $state(false);
	let previewError = $state('');
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	// Serialise the parts of the selected rule that affect the preview.
	// Changes to this string retrigger a debounced preview fetch.
	const previewKey = $derived.by(() => {
		if (selectedIdx < 0) return '';
		const r = localRules[selectedIdx];
		return JSON.stringify({ id: r.id, logic: r.logic, conditions: r.conditions });
	});

	$effect(() => {
		previewKey; // dependency
		if (selectedIdx < 0) return;

		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(runPreview, 400);
	});

	onDestroy(() => {
		if (previewTimer) clearTimeout(previewTimer);
	});

	async function runPreview() {
		if (selectedIdx < 0) return;
		const rule = localRules[selectedIdx];
		previewLoading = true;
		previewError = '';
		try {
			const res = await fetch('/api/rules/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rule })
			});
			const data = await res.json();
			if (data.error) {
				previewError = data.error;
				previewCount = null;
			} else {
				previewCount = data.count ?? 0;
			}
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Preview failed';
			previewCount = null;
		} finally {
			previewLoading = false;
		}
	}

	// --- Save & apply now (SSE stream) ---

	interface Progress {
		status: 'idle' | 'running' | 'done' | 'error';
		scanned: number;
		matched: number;
		applied: number;
		total: number;
		error?: string;
	}
	let progress = $state<Progress>({ status: 'idle', scanned: 0, matched: 0, applied: 0, total: 0 });
	let progressVisible = $state(false);
	let abortCtrl: AbortController | null = null;

	async function saveAndApply() {
		if (selectedIdx < 0) return;
		const ok = await persistAll();
		if (!ok) return;
		await streamApply(localRules[selectedIdx]);
	}

	async function streamApply(rule: Rule) {
		progress = { status: 'running', scanned: 0, matched: 0, applied: 0, total: 0 };
		progressVisible = true;
		abortCtrl = new AbortController();

		try {
			const res = await fetch('/api/rules/apply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: [rule] }),
				signal: abortCtrl.signal
			});
			if (!res.ok || !res.body) {
				progress = { ...progress, status: 'error', error: `HTTP ${res.status}` };
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';
				for (const ev of events) {
					if (!ev.startsWith('data: ')) continue;
					try {
						handleEvent(JSON.parse(ev.slice(6)));
					} catch {
						// skip malformed SSE frame
					}
				}
			}

			if (progress.status === 'running') {
				progress = { ...progress, status: 'done' };
			}
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') return;
			progress = { ...progress, status: 'error', error: err instanceof Error ? err.message : 'Apply failed' };
		} finally {
			abortCtrl = null;
			// Refresh mailboxes so unread counts reflect mark-read actions etc.
			invalidateAll();
		}
	}

	function handleEvent(data: { type: string; [k: string]: unknown }) {
		if (data.type === 'start') {
			progress = { ...progress, total: (data.total as number) ?? 0 };
		} else if (data.type === 'progress') {
			progress = {
				...progress,
				scanned: (data.scanned as number) ?? progress.scanned,
				matched: (data.matched as number) ?? progress.matched,
				applied: (data.applied as number) ?? progress.applied,
				total: (data.total as number) ?? progress.total
			};
		} else if (data.type === 'done') {
			progress = {
				...progress,
				scanned: (data.scanned as number) ?? progress.scanned,
				matched: (data.matched as number) ?? progress.matched,
				applied: (data.applied as number) ?? progress.applied,
				status: 'done'
			};
		} else if (data.type === 'error') {
			progress = { ...progress, status: 'error', error: (data.message as string) ?? 'Error' };
		}
	}

	function dismissProgress() {
		// Leave the stream running if still in progress; just hide the modal.
		progressVisible = false;
	}

	function closeOrCancel() {
		if (progress.status === 'running' && abortCtrl) abortCtrl.abort();
		progressVisible = false;
		progress = { status: 'idle', scanned: 0, matched: 0, applied: 0, total: 0 };
	}

	// --- Derived flags ---

	const progressPercent = $derived(
		progress.total > 0 ? Math.min(100, Math.round((progress.scanned / progress.total) * 100)) : 0
	);

	const folderOptionsById = $derived(new Map(data.mailboxes.map((m) => [m.id, m])));

	function actionSummary(a: RuleAction): string {
		switch (a.type) {
			case 'applyLabel': {
				const label = labelOptions.find((l) => l.id === a.value);
				return label ? `Apply label “${label.name}”` : 'Apply label';
			}
			case 'moveToFolder': {
				const mb = folderOptionsById.get(a.value ?? '');
				return mb ? `Move to “${mb.name}”` : 'Move to folder';
			}
			case 'markRead': return 'Mark as read';
			case 'markImportant': return 'Mark important';
			case 'delete': return 'Delete';
			case 'stopProcessing': return 'Stop processing';
		}
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Filters & Rules', subtitle: 'Settings' })}</title></svelte:head>

<div class="h-full flex flex-col overflow-hidden">
	<header class="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0">
		<a href="/inbox" class="text-sm text-text-tertiary hover:text-text transition-colors">&larr; Inbox</a>
		<div class="w-px h-5 bg-border"></div>
		<h1 class="text-lg font-semibold text-text">Rules</h1>
		<p class="text-xs text-text-tertiary">{localRules.length} {localRules.length === 1 ? 'rule' : 'rules'}</p>
		<div class="flex-1"></div>
		<button
			onclick={createRule}
			class="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
		>
			+ New rule
		</button>
	</header>

	{#if deployError}
		<div class="mx-6 mt-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">{deployError}</div>
	{/if}

	<div class="flex-1 flex min-h-0 overflow-hidden">
		<!-- Rule list -->
		<aside class="w-[280px] shrink-0 border-r border-border overflow-y-auto py-3 px-2">
			{#if localRules.length === 0}
				<p class="text-xs text-text-tertiary text-center py-8 px-3">
					No rules yet. Click “New rule” to get started.
				</p>
			{:else}
				<ul class="flex flex-col gap-0.5">
					{#each localRules as rule (rule.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<li
							class="group relative flex items-center gap-2 pl-3 pr-1 py-2 rounded-lg cursor-pointer transition-all
								{selectedId === rule.id
									? 'bg-accent/10 border-l-2 border-accent text-text'
									: 'border-l-2 border-transparent text-text-secondary hover:bg-surface-hover hover:text-text hover:translate-x-0.5'}"
							onclick={() => { selectedId = rule.id; }}
						>
							<button
								onclick={(e) => { e.stopPropagation(); toggleEnabled(rule.id); }}
								title={rule.enabled ? 'Disable rule' : 'Enable rule'}
								class="w-2.5 h-2.5 rounded-full shrink-0 border cursor-pointer transition-colors
									{rule.enabled ? 'bg-success border-success' : 'bg-transparent border-text-tertiary/50'}"
								aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
							></button>
							<span class="flex-1 truncate text-sm">{rule.name || 'Untitled rule'}</span>
							<button
								onclick={(e) => { e.stopPropagation(); deleteRule(rule.id); }}
								title="Delete rule"
								class="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger p-1 rounded cursor-pointer transition-opacity"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<!-- Editor -->
		<section class="flex-1 overflow-y-auto min-w-0">
			{#if selectedIdx < 0}
				<div class="h-full flex items-center justify-center text-text-tertiary text-sm px-6">
					Select a rule from the list, or click “New rule” to create one.
				</div>
			{:else}
				{@const rule = localRules[selectedIdx]}
				<div class="px-6 py-5 flex flex-col gap-5 max-w-[720px]">
					<!-- Name -->
					<div class="flex flex-col gap-1.5">
						<label for="rule-name" class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Name</label>
						<input
							id="rule-name"
							bind:value={rule.name}
							maxlength={80}
							placeholder="Describe what this rule does"
							class="bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors"
						/>
					</div>

					<!-- Match logic -->
					<div class="flex items-center gap-2 text-sm text-text-secondary">
						<span>Match</span>
						<div class="flex rounded-lg border border-border overflow-hidden">
							<button
								onclick={() => { rule.logic = 'allof'; }}
								class="px-2.5 py-1 text-xs transition-colors cursor-pointer {rule.logic === 'allof' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}"
							>ALL</button>
							<button
								onclick={() => { rule.logic = 'anyof'; }}
								class="px-2.5 py-1 text-xs border-l border-border transition-colors cursor-pointer {rule.logic === 'anyof' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}"
							>ANY</button>
						</div>
						<span>of the following:</span>
					</div>

					<!-- Conditions -->
					<div class="flex flex-col gap-2">
						{#each rule.conditions as condition (condition.id)}
							<div class="flex items-center gap-1.5 flex-wrap" transition:slide={{ duration: 150 }}>
								<select bind:value={condition.field} class="bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent">
									<option value="from">From</option>
									<option value="to">To</option>
									<option value="subject">Subject</option>
									<option value="body">Body</option>
									<option value="size">Size (KB)</option>
									<option value="hasAttachment">Has attachment</option>
								</select>
								{#if condition.field !== 'hasAttachment'}
									<select bind:value={condition.op} class="bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent">
										<option value="contains">contains</option>
										<option value="not_contains">doesn't contain</option>
										<option value="is">is exactly</option>
										<option value="starts_with">starts with</option>
										<option value="ends_with">ends with</option>
									</select>
									<input
										bind:value={condition.value}
										type={condition.field === 'size' ? 'number' : 'text'}
										placeholder={condition.field === 'size' ? 'KB' : 'value…'}
										class="flex-1 min-w-[120px] bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
									/>
								{/if}
								<button
									onclick={() => { condition.negate = !condition.negate; }}
									class="text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors
										{condition.negate ? 'border-danger/50 text-danger bg-danger/10' : 'border-border text-text-tertiary hover:border-text-tertiary'}"
								>NOT</button>
								<button
									onclick={() => removeCondition(condition.id)}
									title="Remove condition"
									class="text-text-tertiary hover:text-danger cursor-pointer p-1 rounded"
									aria-label="Remove condition"
								>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
								</button>
							</div>
						{/each}
						<button
							onclick={addCondition}
							class="text-xs text-accent hover:text-accent-hover cursor-pointer self-start"
						>+ Add condition</button>
					</div>

					<!-- Actions -->
					<div class="flex flex-col gap-2 pt-2 border-t border-border">
						<p class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Then</p>
						{#each rule.actions as action, idx}
							<div class="flex items-center gap-1.5 flex-wrap" transition:slide={{ duration: 150 }}>
								<select bind:value={action.type} class="bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent">
									<option value="applyLabel">Apply label</option>
									<option value="moveToFolder">Move to folder</option>
									<option value="markRead">Mark as read</option>
									<option value="markImportant">Mark important</option>
									<option value="delete">Move to trash</option>
									<option value="stopProcessing">Stop processing</option>
								</select>
								{#if action.type === 'applyLabel'}
									<select bind:value={action.value} class="flex-1 min-w-[140px] bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent">
										<option value="">Select a label…</option>
										{#each labelOptions as lb}
											<option value={lb.id}>{lb.name}</option>
										{/each}
									</select>
								{:else if action.type === 'moveToFolder'}
									<select bind:value={action.value} class="flex-1 min-w-[140px] bg-surface-hover border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent">
										<option value="">Select a folder…</option>
										{#if folderOptions.length > 0}
											<optgroup label="User folders">
												{#each folderOptions as mb}
													<option value={mb.id}>{mb.name}</option>
												{/each}
											</optgroup>
										{/if}
										{#if systemFolderOptions.length > 0}
											<optgroup label="System">
												{#each systemFolderOptions as mb}
													<option value={mb.id}>{mb.name}</option>
												{/each}
											</optgroup>
										{/if}
									</select>
								{/if}
								<button
									onclick={() => removeAction(idx)}
									title="Remove action"
									class="text-text-tertiary hover:text-danger cursor-pointer p-1 rounded"
									aria-label="Remove action"
								>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
								</button>
							</div>
						{/each}
						<button
							onclick={addAction}
							class="text-xs text-accent hover:text-accent-hover cursor-pointer self-start"
						>+ Add action</button>
					</div>

					<!-- Summary line -->
					<p class="text-[11px] text-text-tertiary italic">
						{rule.actions.map(actionSummary).join(' · ') || 'No actions'}
					</p>

					<!-- Match preview + save bar -->
					<div class="rounded-xl border border-border bg-surface-hover/40 p-4 flex items-center gap-3 flex-wrap">
						<div class="flex items-center gap-2">
							{#if previewLoading}
								<span class="w-3 h-3 rounded-full border-2 border-accent/40 border-t-accent animate-spin"></span>
								<span class="text-xs text-text-tertiary">Counting…</span>
							{:else if previewError}
								<span class="text-xs text-danger">{previewError}</span>
							{:else if previewCount !== null}
								<span class="text-sm font-semibold text-text">{previewCount.toLocaleString()}</span>
								<span class="text-xs text-text-tertiary">
									existing {previewCount === 1 ? 'email matches' : 'emails match'} this rule
								</span>
							{:else}
								<span class="text-xs text-text-tertiary">No preview</span>
							{/if}
						</div>
						<div class="flex-1"></div>
						<button
							onclick={saveOnly}
							disabled={saving}
							class="text-sm text-text-secondary hover:text-text border border-border hover:border-text-tertiary px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
						>
							{saving ? 'Saving…' : 'Save'}
						</button>
						<button
							onclick={saveAndApply}
							disabled={saving}
							class="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
						>
							Save &amp; apply now
						</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>

{#if savedToast}
	<div
		class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-full px-4 py-2 text-sm text-text shadow-lg z-50"
		transition:fly={{ y: 12, duration: 200 }}
	>
		Saved
	</div>
{/if}

{#if progressVisible}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="w-[420px] bg-surface border border-border rounded-2xl p-5 shadow-[0_16px_64px_rgba(0,0,0,0.5)]"
			transition:fly={{ y: 16, duration: 200 }}
		>
			<div class="flex items-center gap-2 mb-3">
				{#if progress.status === 'running'}
					<span class="w-3 h-3 rounded-full border-2 border-accent/40 border-t-accent animate-spin"></span>
					<h2 class="text-sm font-semibold text-text">Applying rule…</h2>
				{:else if progress.status === 'done'}
					<svg class="text-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					<h2 class="text-sm font-semibold text-text">Applied</h2>
				{:else if progress.status === 'error'}
					<svg class="text-danger" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					<h2 class="text-sm font-semibold text-text">Failed</h2>
				{/if}
			</div>

			<div class="h-1.5 bg-surface-hover rounded-full overflow-hidden mb-3">
				<div
					class="h-full bg-accent transition-all duration-300 ease-out"
					style="width: {progress.status === 'done' ? 100 : progressPercent}%;"
				></div>
			</div>

			<div class="flex items-baseline gap-3 text-xs text-text-secondary mb-4">
				<span>Scanned <span class="text-text font-medium tabular-nums">{progress.scanned.toLocaleString()}</span></span>
				<span class="text-text-tertiary">·</span>
				<span>Matched <span class="text-text font-medium tabular-nums">{progress.matched.toLocaleString()}</span></span>
				<span class="text-text-tertiary">·</span>
				<span>Applied <span class="text-text font-medium tabular-nums">{progress.applied.toLocaleString()}</span></span>
				{#if progress.total > 0}
					<span class="text-text-tertiary ml-auto">of {progress.total.toLocaleString()}</span>
				{/if}
			</div>

			{#if progress.status === 'error' && progress.error}
				<p class="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs mb-4">
					{progress.error}
				</p>
			{/if}

			<div class="flex items-center gap-2 justify-end">
				{#if progress.status === 'running'}
					<button
						onclick={dismissProgress}
						class="text-xs text-text-tertiary hover:text-text px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
					>
						Run in background
					</button>
					<button
						onclick={closeOrCancel}
						class="text-xs text-danger hover:text-danger border border-danger/30 hover:border-danger/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
					>
						Cancel
					</button>
				{:else if progress.status === 'error'}
					<button
						onclick={closeOrCancel}
						class="text-xs text-text-tertiary hover:text-text px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
					>
						Close
					</button>
					<button
						onclick={saveAndApply}
						class="text-xs bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
					>
						Retry
					</button>
				{:else}
					<button
						onclick={closeOrCancel}
						class="text-xs bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
					>
						Done
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
