<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Watch-only report: how Jev's spam calls compared with Stalwart's over
	 * the last 30 days, and the emails where they disagree — what to read
	 * through before letting Jev act.
	 */

	interface Listed {
		id: string;
		from: string;
		subject: string;
		spam: number;
		phishing: number;
		correctedTo: 'spam' | 'ham' | null;
	}
	interface Report {
		days: number;
		judged: number;
		agree: number;
		unsure: number;
		youAgreedWithJev: number;
		youOverruledJev: number;
		jevStricter: { count: number; emails: Listed[] };
		jevLooser: { count: number; emails: Listed[] };
	}

	let report = $state<Report | null>(null);
	let error = $state('');

	onMount(async () => {
		const res = await fetch('/api/jev/spam-report').catch(() => null);
		if (res?.ok) report = await res.json();
		else error = 'Couldn’t load the report.';
	});

	const pct = (n: number) => `${Math.round(n * 100)}%`;
	const agreement = $derived(
		report && report.judged - report.unsure > 0 ? report.agree / (report.judged - report.unsure) : null
	);
</script>

<div class="mt-3 rounded-lg border border-border bg-surface-hover/40 p-3 text-xs">
	{#if error}
		<p class="text-danger">{error}</p>
	{:else if !report}
		<p class="text-text-tertiary">Loading the report…</p>
	{:else if report.judged === 0}
		<p class="text-text-tertiary">No spam checks yet. They start with mail that arrives from now on.</p>
	{:else}
		<p class="text-text-secondary">
			Last {report.days} days: Jev checked <span class="font-semibold text-text">{report.judged}</span> emails.
			Where it was sure, it agreed with Stalwart on
			<span class="font-semibold text-text">{report.agree}</span>{agreement !== null ? ` (${pct(agreement)})` : ''};
			it wasn’t sure about {report.unsure}.
			{#if report.youAgreedWithJev + report.youOverruledJev > 0}
				Your own Spam / Not spam clicks agreed with Jev {report.youAgreedWithJev} times and overruled it
				{report.youOverruledJev}.
			{/if}
		</p>

		{#each [{ title: 'Jev says spam, Stalwart let it through', side: report.jevStricter }, { title: 'Jev says fine, Stalwart flagged it', side: report.jevLooser }] as group (group.title)}
			{#if group.side.count > 0}
				<p class="mt-3 mb-1 font-medium text-text">{group.title} · {group.side.count}</p>
				<ul class="rounded-md border border-border divide-y divide-border bg-surface max-h-56 overflow-y-auto">
					{#each group.side.emails as e (e.id)}
						<li class="px-2.5 py-1.5 flex items-center gap-2">
							<a href="/email/{e.id}" class="flex-1 min-w-0 no-underline">
								<span class="block truncate text-text">{e.subject || '(no subject)'}</span>
								<span class="block truncate text-text-tertiary">{e.from}</span>
							</a>
							<span class="shrink-0 tabular-nums text-text-tertiary" title="Jev’s spam and phishing probabilities">
								spam {pct(e.spam)} · phishing {pct(e.phishing)}
							</span>
							{#if e.correctedTo}
								<span class="shrink-0 text-text-secondary">you said {e.correctedTo === 'spam' ? 'spam' : 'not spam'}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	{/if}
</div>
