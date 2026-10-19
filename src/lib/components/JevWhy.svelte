<script lang="ts">
	import { INBOX_CATEGORIES, type InboxCategory } from '$lib/types/categories';

	/**
	 * "Why is this here?" — Jev's decision for one email: its tab pick, how
	 * sure it was, where the probability went, what it said about your rules'
	 * Jev conditions, and the facts that were sent with the email. Renders
	 * nothing for mail Jev never answered for.
	 */
	let { emailId }: { emailId: string } = $props();

	interface RuleCheck {
		ruleId: string;
		ruleName: string;
		statement: string;
		probability: number;
		threshold: number;
		negate: boolean;
		fired: boolean;
		/** You said this rule shouldn't have fired here. */
		markedWrong: boolean;
	}

	interface Decision {
		/** Null when only rules were asked about (tabs off). */
		category: InboxCategory | null;
		confidence: number | null;
		applied: InboxCategory | null;
		correctedTo: InboxCategory | null;
		probabilities: Record<string, number>;
		facts: Record<string, boolean | string | null>;
		rules: RuleCheck[];
		/** The sender pin that chose the tab, when one did. */
		pinnedBy: string | null;
		model: string | null;
		mock: boolean;
	}

	let decision = $state<Decision | null>(null);
	let open = $state(false);

	$effect(() => {
		const id = emailId;
		decision = null;
		open = false;
		let cancelled = false;
		fetch(`/api/jev/decision/${encodeURIComponent(id)}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((body) => {
				if (!cancelled) decision = (body?.decision as Decision | null) ?? null;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	const labelOf = (key: string) => INBOX_CATEGORIES.find((c) => c.key === key)?.label ?? key;
	const percent = (n: number | null | undefined) => `${Math.round((n ?? 0) * 100)}%`;

	// Plain-language names for the facts, phrased as the "yes" case.
	const FACT_LABELS: Record<string, string> = {
		sender_in_contacts: 'Sender is in your contacts',
		you_have_written_to_sender: 'You’ve written to this sender',
		you_have_written_in_this_thread: 'You’ve written in this conversation',
		addressed_to_you_directly: 'Addressed to you directly',
		has_list_unsubscribe: 'Has an unsubscribe link',
		list_id: 'Sent through a mailing list',
		bulk_precedence: 'Marked as bulk mail',
		auto_submitted: 'Sent automatically',
		sender_looks_automated: 'From a no-reply address',
		contains_sign_in_code: 'Contains a sign-in code'
	};

	// Only these come back null for "couldn't tell"; for the rest (a missing
	// list id, say) null simply means no.
	const LOOKED_UP = new Set(['sender_in_contacts', 'you_have_written_to_sender', 'you_have_written_in_this_thread']);

	const factRows = $derived(
		decision
			? Object.entries(FACT_LABELS).map(([key, label]) => {
					const value = decision!.facts[key];
					const unknown = LOOKED_UP.has(key) && (value === null || value === undefined);
					return { label, state: unknown ? 'unknown' : value ? 'yes' : 'no' };
				})
			: []
	);

	const firedRules = $derived(
		decision ? [...new Map(decision.rules.filter((r) => r.fired).map((r) => [r.ruleId, r.ruleName])).values()] : []
	);

	const chipLabel = $derived.by(() => {
		if (!decision) return '';
		if (decision.category) return labelOf(decision.applied ?? decision.category);
		return firedRules.length === 1 ? `rule “${firedRules[0]}”` : firedRules.length > 1 ? `${firedRules.length} rules` : 'rules checked';
	});

	const history = $derived(
		typeof decision?.facts.sender_history === 'string' ? decision.facts.sender_history : null
	);

	let feedbackError = $state('');

	async function markWrong(ruleId: string) {
		if (!decision) return;
		feedbackError = '';
		const res = await fetch('/api/jev/rule-feedback', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ emailId, ruleId })
		}).catch(() => null);
		if (!res?.ok) {
			feedbackError = 'Couldn’t save that. Try again.';
			return;
		}
		decision.rules = decision.rules.map((r) => (r.ruleId === ruleId ? { ...r, markedWrong: true } : r));
	}

	const summary = $derived.by(() => {
		if (!decision?.category) return '';
		if (decision.pinnedBy) {
			return `You pinned ${decision.pinnedBy} to ${labelOf(decision.category)}, so Jev wasn’t asked which tab.`;
		}
		const sure = percent(decision.confidence);
		if (decision.correctedTo && decision.correctedTo !== (decision.applied ?? 'important')) {
			return `Jev picked ${labelOf(decision.category)}; you moved it to ${labelOf(decision.correctedTo)}.`;
		}
		if (decision.applied) return `Jev put this in ${labelOf(decision.applied)} (confidence ${sure}).`;
		return `Jev leaned to ${labelOf(decision.category)} (confidence ${sure}) — not sure enough to move it.`;
	});
</script>

{#if decision}
	<div class="flex flex-col items-end">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			title="Why is this here?"
			class="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full cursor-pointer bg-accent/10 text-accent-fg hover:bg-accent/15"
		>
			Jev · {chipLabel}{decision.mock ? ' (mock)' : ''}
			<span aria-hidden="true">{open ? '▴' : '▾'}</span>
		</button>

		{#if open}
			<div class="mt-1 w-72 rounded-lg border border-border bg-surface p-3 text-xs text-left shadow-xl">
				{#if summary}
					<p class="text-text">{summary}</p>
				{/if}
				{#if decision.mock}
					<p class="mt-1 text-warning">
						Mock answer: worked out locally from the facts below. Jev wasn’t asked.
					</p>
				{/if}

				{#if decision.rules.length > 0}
					<p class="mt-2.5 mb-1 text-3xs uppercase tracking-wider text-text-tertiary font-semibold">Your rules</p>
					<ul class="space-y-1.5">
						{#each decision.rules as check, i (i)}
							<li>
								<p class="text-text">
									<span class={check.fired ? 'text-success' : 'text-text-tertiary'} aria-hidden="true">{check.fired ? '✓' : '–'}</span>
									{check.ruleName}{check.fired ? ' fired' : ' didn’t fire'}
								</p>
								<p class="text-text-tertiary">
									{check.negate ? 'Not: ' : ''}“{check.statement}” — {percent(check.probability)}, needs {percent(check.threshold)}
								</p>
								{#if check.fired && (i === 0 || decision.rules[i - 1].ruleId !== check.ruleId)}
									{#if check.markedWrong}
										<p class="text-text-tertiary italic">Noted — counted against this rule.</p>
									{:else}
										<button
											type="button"
											onclick={() => markWrong(check.ruleId)}
											class="text-accent-fg hover:text-accent-fg-hover cursor-pointer"
										>
											Shouldn’t have fired
										</button>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
					{#if feedbackError}
						<p class="mt-1 text-danger">{feedbackError}</p>
					{/if}
				{/if}

				{#if decision.category && !decision.pinnedBy}
				<ul class="mt-2.5 space-y-1">
					{#each INBOX_CATEGORIES as c (c.key)}
						{@const p = decision.probabilities[c.key] ?? 0}
						<li class="flex items-center gap-2">
							<span class="w-20 shrink-0 {c.key === decision.category ? 'text-text font-medium' : 'text-text-secondary'}">{c.label}</span>
							<span class="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden">
								<span class="block h-full rounded-full bg-accent" style="width: {Math.round(p * 100)}%"></span>
							</span>
							<span class="w-9 shrink-0 text-right tabular-nums text-text-tertiary">{percent(p)}</span>
						</li>
					{/each}
				</ul>
				{/if}

				{#if decision.model}
				<!-- Only when Jev was called: a pinned sender's mail sends nothing. -->
				<p class="mt-3 mb-1 text-3xs uppercase tracking-wider text-text-tertiary font-semibold">
					Sent with the email
				</p>
				<ul class="space-y-0.5">
					{#if history}
						<li class="flex items-start gap-1.5 text-text-secondary">
							<span class="w-3 text-center" aria-hidden="true">↺</span>
							<span>{history}</span>
						</li>
					{/if}
					{#each factRows as f (f.label)}
						<li class="flex items-center gap-1.5 {f.state === 'yes' ? 'text-text-secondary' : 'text-text-tertiary'}">
							<span class="w-3 text-center" aria-hidden="true">{f.state === 'yes' ? '✓' : f.state === 'no' ? '–' : '?'}</span>
							<span>{f.label}{f.state === 'no' ? ': no' : f.state === 'unknown' ? ': couldn’t check' : ''}</span>
						</li>
					{/each}
				</ul>

					<p class="mt-2 text-3xs text-text-tertiary">Model: {decision.model}</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}
