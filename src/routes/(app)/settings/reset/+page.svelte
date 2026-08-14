<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import { goto, invalidateAll } from '$app/navigation';

	let resetting = $state(false);

	async function resetAll() {
		if (!confirm('Reset every preference to its default? Your mail is untouched but every device-scoped setting will be cleared.')) return;
		resetting = true;
		try {
			await fetch('/api/preferences/reset', { method: 'POST' });
			await invalidateAll();
			goto('/settings/account');
		} finally {
			resetting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Reset', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Reset</h1>
	<p class="text-sm text-text-tertiary mt-1 max-w-prose">
		Clear every cookie-backed preference for this browser. Your mail, signatures, label colors, and
		signed-in identity live on the mail server and are <strong>not</strong> affected.
	</p>
</header>

<section>
	<div class="rounded-xl border border-danger/30 bg-danger/5 p-4 flex items-start gap-4">
		<div class="flex-1">
			<p class="text-sm font-medium text-danger">Reset all preferences</p>
			<p class="text-xs text-text-tertiary mt-1">
				Clears theme, density, reading-pane, composer defaults, mail display options, notification
				toggles, auto-reply text, folder-expand state, and rule definitions back to their defaults.
				You'll be returned to the Account page.
			</p>
		</div>
		<button
			onclick={resetAll}
			disabled={resetting}
			class="text-sm bg-danger/10 border border-danger/40 text-danger hover:bg-danger/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
		>
			{resetting ? 'Resetting…' : 'Reset'}
		</button>
	</div>
</section>
