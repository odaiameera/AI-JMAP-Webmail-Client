<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Label } from '$lib/types/labels';
	import type { Rule, RuleCondition, RuleAction } from '$lib/types/rules';
	import type { Mailbox } from '$lib/jmap/types';

	let { onClose, initialTheme, displayName, signature, labels, rules, mailboxes }: {
		onClose: () => void;
		initialTheme: string;
		displayName: string;
		signature: string;
		labels: Label[];
		rules: Rule[];
		mailboxes: Mailbox[];
	} = $props();

	let activeCategory = $state<string>('appearance');
	let theme = $state(initialTheme);
	let localDisplayName = $state(displayName);
	let localSignature = $state(signature);
	let accountSaved = $state(false);
	let saving = $state(false);

	// Labels state — the `labels` prop is the source of truth (server-loaded).
	// We only keep UI state locally (pending form values, which row is being
	// edited, which mutation is in flight for a spinner).
	let showCreateForm = $state(false);
	let newLabelName = $state('');
	let newLabelColor = $state('#6366F1');
	let editingLabelId = $state<string | null>(null);
	let editingLabelName = $state('');
	let creatingLabel = $state(false);
	let deletingLabelId = $state<string | null>(null);
	let renamingLabelId = $state<string | null>(null);
	let labelError = $state('');

	// Rules state
	let localRules = $state<Rule[]>([...rules]);
	let editingRuleId = $state<string | null>(null);
	let deployError = $state('');
	let applying = $state(false);
	let applyToExisting = $state(false);

	const categories = [
		{ id: 'appearance', label: 'Look',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>` },
		{ id: 'account', label: 'Account',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>` },
		{ id: 'labels', label: 'Labels',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>` },
		{ id: 'filters', label: 'Filters',
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>` },
		{ id: 'notifications', label: 'Alerts', soon: true,
			icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>` },
	];

	// Theme
	async function toggleTheme() {
		const next = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		document.documentElement.classList.toggle('light', next === 'light');
		await fetch('/api/preferences/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: next })
		});
	}

	// Account
	async function saveAccountSettings() {
		saving = true;
		accountSaved = false;
		try {
			await fetch('/api/preferences/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName: localDisplayName, signature: localSignature })
			});
			accountSaved = true;
			await invalidateAll();
			setTimeout(() => { accountSaved = false; }, 2000);
		} finally { saving = false; }
	}

	// Labels — each mutation hits /api/preferences/labels with an action
	// payload, then invalidateAll() refreshes the layout loader so the
	// `labels` prop reflects the new JMAP state.
	async function labelRequest(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
		const res = await fetch('/api/preferences/labels', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data?.success === false) {
			return { success: false, error: data?.error ?? `HTTP ${res.status}` };
		}
		return { success: true };
	}

	async function createLabel() {
		const name = newLabelName.trim();
		if (!name) return;
		labelError = '';
		creatingLabel = true;
		try {
			const result = await labelRequest({ action: 'create', name, color: newLabelColor });
			if (!result.success) {
				labelError = result.error ?? 'Failed to create label';
				return;
			}
			await invalidateAll();
			newLabelName = '';
			newLabelColor = '#6366F1';
			showCreateForm = false;
		} finally {
			creatingLabel = false;
		}
	}

	async function deleteLabel(id: string) {
		labelError = '';
		deletingLabelId = id;
		try {
			const result = await labelRequest({ action: 'delete', id });
			if (!result.success) {
				labelError = result.error ?? 'Failed to delete label';
				return;
			}
			await invalidateAll();
		} finally {
			deletingLabelId = null;
		}
	}

	async function updateLabelColor(id: string, color: string) {
		labelError = '';
		const result = await labelRequest({ action: 'updateColor', id, color });
		if (!result.success) {
			labelError = result.error ?? 'Failed to update color';
			return;
		}
		await invalidateAll();
	}

	async function saveLabelEdit(id: string) {
		const name = editingLabelName.trim();
		editingLabelId = null;
		if (!name) return;
		labelError = '';
		renamingLabelId = id;
		try {
			const result = await labelRequest({ action: 'rename', id, name });
			if (!result.success) {
				labelError = result.error ?? 'Failed to rename label';
				return;
			}
			await invalidateAll();
		} finally {
			renamingLabelId = null;
		}
	}

	// Rules — save to cookie AND deploy to server silently
	async function saveAndDeployRules(alsoApplyToExisting = false) {
		deployError = '';
		try {
			// Save to cookie
			await fetch('/api/preferences/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: localRules })
			});
			// Deploy to server (silent unless error)
			const res = await fetch('/api/rules/deploy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: localRules })
			});
			const data = await res.json();
			if (!data.success) {
				deployError = data.error ?? 'Deploy failed';
			}
			// Apply to existing emails if requested
			if (alsoApplyToExisting) {
				applying = true;
				await fetch('/api/rules/apply', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ rules: localRules })
				});
				applying = false;
			}
		} catch {
			deployError = 'Failed to save rules';
		}
	}

	function createRule() {
		const id = 'rule_' + Date.now();
		const newRule: Rule = {
			id, name: 'New rule', enabled: true, logic: 'allof',
			conditions: [{ id: 'c1', field: 'from', op: 'contains', value: '', negate: false }],
			actions: [{ type: 'moveToFolder', value: 'INBOX' }],
			createdAt: Date.now()
		};
		localRules = [...localRules, newRule];
		editingRuleId = id;
		saveAndDeployRules();
	}

	function toggleRule(id: string) {
		localRules = localRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
		saveAndDeployRules();
	}

	function deleteRule(id: string) {
		localRules = localRules.filter(r => r.id !== id);
		if (editingRuleId === id) editingRuleId = null;
		saveAndDeployRules();
	}

	function updateRule(id: string, updates: Partial<Rule>) {
		localRules = localRules.map(r => r.id === id ? { ...r, ...updates } : r);
	}

	function addCondition(ruleId: string) {
		localRules = localRules.map(r => {
			if (r.id !== ruleId) return r;
			return { ...r, conditions: [...r.conditions, { id: 'c_' + Date.now(), field: 'from' as const, op: 'contains' as const, value: '', negate: false }] };
		});
	}

	function removeCondition(ruleId: string, condId: string) {
		localRules = localRules.map(r => {
			if (r.id !== ruleId) return r;
			return { ...r, conditions: r.conditions.filter(c => c.id !== condId) };
		});
	}

	function addAction(ruleId: string) {
		localRules = localRules.map(r => {
			if (r.id !== ruleId) return r;
			return { ...r, actions: [...r.actions, { type: 'markRead' as const }] };
		});
	}

	function removeAction(ruleId: string, idx: number) {
		localRules = localRules.map(r => {
			if (r.id !== ruleId) return r;
			return { ...r, actions: r.actions.filter((_, i) => i !== idx) };
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[520px] overflow-hidden
	bg-surface border border-border rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.5)] flex flex-col animate-compose-modal-in">

	<!-- Header -->
	<div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
		<h2 class="text-base font-semibold text-text">Settings</h2>
		<button onclick={onClose} title="Close"
			class="text-text-tertiary hover:text-text transition-colors cursor-pointer">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75">
				<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>

	<!-- Body -->
	<div class="flex flex-1 overflow-hidden min-h-0">
		<!-- Nav -->
		<nav class="w-44 shrink-0 border-r border-border py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
			{#each categories as cat}
				<button
					onclick={() => { if (!cat.soon) activeCategory = cat.id; }}
					class="flex items-center gap-2.5 py-2 px-3 rounded-lg text-left text-sm transition-colors w-full
						{cat.soon
							? 'text-text-tertiary/40 cursor-not-allowed'
							: activeCategory === cat.id
								? 'bg-accent/10 text-accent cursor-pointer'
								: 'text-text-tertiary hover:text-text hover:bg-surface-hover cursor-pointer'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center">{@html cat.icon}</span>
					<span>{cat.label}</span>
				</button>
			{/each}
		</nav>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto">

			<!-- APPEARANCE -->
			{#if activeCategory === 'appearance'}
				<div class="px-6 py-5 flex flex-col gap-5">
					<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Appearance</h3>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-text font-medium">Theme</p>
							<p class="text-xs text-text-tertiary mt-0.5">Light or dark interface</p>
						</div>
						<button onclick={toggleTheme}
							class="relative w-11 h-6 rounded-full transition-colors cursor-pointer
								{theme === 'light' ? 'bg-accent' : 'bg-surface-hover border border-border'}">
							<span class="absolute top-0.5 transition-transform w-5 h-5 rounded-full bg-white shadow-sm
								{theme === 'light' ? 'translate-x-5' : 'translate-x-0.5'}"></span>
						</button>
					</div>
					<p class="text-xs text-text-tertiary -mt-2">{theme === 'light' ? 'Light mode' : 'Dark mode'}</p>
				</div>

			<!-- ACCOUNT -->
			{:else if activeCategory === 'account'}
				<div class="px-6 py-5 flex flex-col gap-5">
					<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Account</h3>
					<div class="flex flex-col gap-1.5">
						<label for="settings-name" class="text-sm font-medium text-text">Display name</label>
						<p class="text-xs text-text-tertiary">Shown in the header and outgoing emails</p>
						<input id="settings-name" bind:value={localDisplayName} type="text" placeholder="Your name"
							class="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors" />
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="settings-sig" class="text-sm font-medium text-text">Email signature</label>
						<p class="text-xs text-text-tertiary">Appended to new emails automatically</p>
						<textarea id="settings-sig" bind:value={localSignature} rows={4} placeholder="e.g. Best regards,&#10;Odai Ameera"
							class="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-tertiary outline-none resize-none focus:border-accent transition-colors font-sans"></textarea>
					</div>
					<button onclick={saveAccountSettings} disabled={saving}
						class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors cursor-pointer disabled:cursor-not-allowed">
						{saving ? 'Saving...' : 'Save'}
					</button>
					{#if accountSaved}
						<p class="text-xs text-green-400 text-center -mt-2">Saved successfully</p>
					{/if}
				</div>

			<!-- LABELS -->
			{:else if activeCategory === 'labels'}
				<div class="px-6 py-5 flex flex-col gap-4">
					<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Labels</h3>

					{#if labelError}
						<div class="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{labelError}</div>
					{/if}

					{#if showCreateForm}
						<div class="flex items-center gap-2 p-3 bg-surface-hover rounded-lg border border-border">
							<input type="color" bind:value={newLabelColor} class="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" title="Pick color" disabled={creatingLabel} />
							<input bind:value={newLabelName} type="text" placeholder="Label name" maxlength={30}
								disabled={creatingLabel}
								class="flex-1 bg-transparent text-sm text-text outline-none placeholder-text-tertiary disabled:opacity-60"
								onkeydown={(e) => e.key === 'Enter' && createLabel()} />
							<button onclick={createLabel} disabled={creatingLabel || !newLabelName.trim()}
								class="inline-flex items-center gap-1.5 text-xs bg-accent text-white px-3 py-1 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
								{#if creatingLabel}
									<span class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
									Creating
								{:else}
									Create
								{/if}
							</button>
							<button onclick={() => { showCreateForm = false; labelError = ''; }} disabled={creatingLabel} class="text-xs text-text-tertiary hover:text-text cursor-pointer disabled:opacity-60">Cancel</button>
						</div>
					{:else}
						<button onclick={() => { showCreateForm = true; labelError = ''; }}
							class="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-border text-sm text-text-tertiary hover:text-text hover:border-text-tertiary transition-colors cursor-pointer">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							New label
						</button>
					{/if}

					{#if labels.length === 0}
						<p class="text-xs text-text-tertiary text-center py-4">No labels yet. Create one above.</p>
					{:else}
						<div class="flex flex-col">
							{#each labels as label (label.id)}
								<div class="flex items-center gap-3 py-2 px-1 group">
									<label class="cursor-pointer shrink-0" title="Change color">
										<input type="color" class="sr-only" value={label.color}
											onchange={(e) => updateLabelColor(label.id, (e.currentTarget as HTMLInputElement).value)} />
										<span class="w-3 h-3 rounded-full block border border-white/20" style="background-color: {label.color}"></span>
									</label>
									{#if editingLabelId === label.id}
										<input bind:value={editingLabelName}
											onblur={() => saveLabelEdit(label.id)}
											onkeydown={(e) => e.key === 'Enter' && saveLabelEdit(label.id)}
											class="flex-1 bg-surface-hover border border-accent rounded px-2 py-0.5 text-sm text-text outline-none" />
									{:else}
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<span class="flex-1 text-sm text-text cursor-pointer hover:text-text-secondary"
											ondblclick={() => { editingLabelId = label.id; editingLabelName = label.name; }}>
											{label.name}
											{#if renamingLabelId === label.id}
												<span class="ml-2 inline-block w-3 h-3 rounded-full border-2 border-text-tertiary/40 border-t-text-tertiary animate-spin align-middle"></span>
											{/if}
										</span>
									{/if}
									{#if deletingLabelId === label.id}
										<span class="w-3 h-3 rounded-full border-2 border-red-400/40 border-t-red-400 animate-spin"></span>
									{:else}
										<button onclick={() => deleteLabel(label.id)} title="Delete label"
											disabled={deletingLabelId !== null}
											class="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-400 cursor-pointer p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed">
											<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75">
												<path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
											</svg>
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

			<!-- FILTERS -->
			{:else if activeCategory === 'filters'}
				<div class="px-6 py-5 flex flex-col gap-4">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Rules & Filters</h3>
						<button onclick={createRule}
							class="text-xs bg-accent text-white px-3 py-1 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
							+ Rule
						</button>
					</div>

					{#if deployError}
						<div class="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{deployError}</div>
					{/if}

					{#if applying}
						<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs">
							Applying rules to existing emails...
						</div>
					{/if}

					{#if localRules.length === 0}
						<p class="text-xs text-text-tertiary text-center py-4">No rules yet. Create one above.</p>
					{:else}
						<div class="flex flex-col gap-2">
							{#each localRules as rule}
								<div class="border border-border rounded-lg overflow-hidden">
									<!-- Rule header row -->
									<div class="flex items-center gap-2 px-3 py-2 bg-surface-hover/50">
										<button onclick={() => toggleRule(rule.id)} title={rule.enabled ? 'Disable' : 'Enable'}
											class="w-3 h-3 rounded-full shrink-0 border-2 cursor-pointer transition-colors
												{rule.enabled ? 'bg-green-400 border-green-400' : 'border-text-tertiary'}"></button>
										<span class="flex-1 text-sm text-text truncate">{rule.name}</span>
										<button onclick={() => editingRuleId = editingRuleId === rule.id ? null : rule.id}
											class="text-xs text-text-tertiary hover:text-text cursor-pointer px-2 py-0.5 rounded hover:bg-surface-hover transition-colors">
											{editingRuleId === rule.id ? 'Close' : 'Edit'}
										</button>
										<button onclick={() => deleteRule(rule.id)}
											class="text-text-tertiary hover:text-red-400 cursor-pointer p-1">
											<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75">
												<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
											</svg>
										</button>
									</div>

									<!-- Rule editor (expanded) -->
									{#if editingRuleId === rule.id}
										<div class="px-3 py-3 flex flex-col gap-3 border-t border-border">
											<!-- Rule name -->
											<input bind:value={rule.name} type="text" placeholder="Rule name"
												oninput={() => { updateRule(rule.id, { name: rule.name }); }}
												class="bg-surface-hover border border-border rounded px-2 py-1.5 text-sm text-text outline-none focus:border-accent w-full" />

											<!-- Logic toggle -->
											<div class="flex items-center gap-2 text-xs text-text-tertiary">
												<span>Match</span>
												<div class="flex rounded-lg border border-border overflow-hidden">
													<button onclick={() => { rule.logic = 'allof'; updateRule(rule.id, { logic: 'allof' }); }}
														class="px-2.5 py-1 transition-colors cursor-pointer {rule.logic === 'allof' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}">ALL</button>
													<button onclick={() => { rule.logic = 'anyof'; updateRule(rule.id, { logic: 'anyof' }); }}
														class="px-2.5 py-1 border-l border-border transition-colors cursor-pointer {rule.logic === 'anyof' ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-hover'}">ANY</button>
												</div>
												<span>of:</span>
											</div>

											<!-- Conditions -->
											{#each rule.conditions as condition}
												<div class="flex items-center gap-1.5 flex-wrap">
													<select bind:value={condition.field} class="bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none">
														<option value="from">From</option>
														<option value="to">To</option>
														<option value="subject">Subject</option>
														<option value="body">Body</option>
														<option value="size">Size (KB)</option>
														<option value="hasAttachment">Has attachment</option>
													</select>
													{#if condition.field !== 'hasAttachment'}
														<select bind:value={condition.op} class="bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none">
															<option value="contains">contains</option>
															<option value="not_contains">doesn't contain</option>
															<option value="is">is exactly</option>
															<option value="starts_with">starts with</option>
															<option value="ends_with">ends with</option>
														</select>
														<input bind:value={condition.value} type={condition.field === 'size' ? 'number' : 'text'}
															placeholder={condition.field === 'size' ? 'KB' : 'value...'}
															class="flex-1 min-w-[80px] bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none focus:border-accent" />
													{/if}
													<button onclick={() => { condition.negate = !condition.negate; }}
														class="text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors
															{condition.negate ? 'border-red-400/50 text-red-400 bg-red-400/10' : 'border-border text-text-tertiary hover:border-text-tertiary'}">NOT</button>
													<button onclick={() => removeCondition(rule.id, condition.id)}
														class="text-text-tertiary hover:text-red-400 cursor-pointer p-0.5">
														<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
													</button>
												</div>
											{/each}
											<button onclick={() => addCondition(rule.id)}
												class="text-xs text-accent hover:text-accent-hover cursor-pointer self-start">+ Add condition</button>

											<!-- Actions -->
											<div class="text-xs text-text-tertiary mt-1">Then:</div>
											{#each rule.actions as action, idx}
												<div class="flex items-center gap-1.5">
													<select bind:value={action.type} class="bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none">
														<option value="moveToFolder">Move to folder</option>
														<option value="applyLabel">Apply label</option>
														<option value="markRead">Mark as read</option>
														<option value="markImportant">Mark important</option>
														<option value="delete">Delete</option>
														<option value="stopProcessing">Stop processing</option>
													</select>
													{#if action.type === 'moveToFolder'}
														<select bind:value={action.value} class="bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none flex-1">
															{#each mailboxes as mb}
																<option value={mb.name}>{mb.name}</option>
															{/each}
														</select>
													{:else if action.type === 'applyLabel'}
														<select bind:value={action.value} class="bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text outline-none flex-1">
															{#each labels as lb}
																<option value={lb.id}>{lb.name}</option>
															{/each}
														</select>
													{/if}
													<button onclick={() => removeAction(rule.id, idx)}
														class="text-text-tertiary hover:text-red-400 cursor-pointer p-0.5">
														<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
													</button>
												</div>
											{/each}
											<button onclick={() => addAction(rule.id)}
												class="text-xs text-accent hover:text-accent-hover cursor-pointer self-start">+ Add action</button>

											<!-- Save rule -->
											<div class="flex items-center justify-between mt-2">
												<label class="flex items-center gap-2 cursor-pointer select-none">
													<input type="checkbox" bind:checked={applyToExisting}
														class="w-3.5 h-3.5 rounded border-border accent-accent cursor-pointer" />
													<span class="text-xs text-text-tertiary">Apply to existing emails</span>
												</label>
												<button onclick={() => { saveAndDeployRules(applyToExisting); editingRuleId = null; applyToExisting = false; }}
													class="text-xs bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
													Save rule
												</button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

			<!-- COMING SOON -->
			{:else}
				<div class="flex flex-col items-center justify-center gap-2 py-12 text-text-tertiary">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75">
						<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
					</svg>
					<p class="text-xs">Coming soon</p>
				</div>
			{/if}
		</div>
	</div>
</div>
