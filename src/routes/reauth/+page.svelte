<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$lib/utils/title';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);

	async function switchTo(id: string) {
		await fetch('/api/accounts/switch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		window.location.href = '/inbox';
	}
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Reconnect account' })}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<h1 class="text-2xl font-bold text-text">ameera. <span class="text-text-tertiary font-normal">Mail</span></h1>
			<p class="text-text-tertiary mt-1 text-sm">
				The mail server rejected the stored credentials for
				<span class="text-text-secondary">{data.accountEmail}</span>.
				Enter the account's current password to reconnect.
			</p>
		</div>

		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			{#if form?.error}
				<div class="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-4 py-3">
					{form.error}
				</div>
			{/if}

			<div>
				<label for="password" class="block text-sm text-text-secondary mb-1.5">Mail account password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-text
						focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg
					px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
			>
				{loading ? 'Reconnecting…' : 'Reconnect'}
			</button>
		</form>

		{#if data.otherAccounts.length > 0}
			<div class="mt-6 text-center">
				<p class="text-xs text-text-tertiary mb-2">Or continue with another account:</p>
				{#each data.otherAccounts as account (account.id)}
					<button
						type="button"
						onclick={() => switchTo(account.id)}
						class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary
							hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
					>
						<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {account.color}"></span>
						{account.email}
					</button>
				{/each}
			</div>
		{/if}

		<div class="mt-4 text-center">
			<form method="POST" action="/logout" class="inline">
				<button type="submit" class="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer">
					Sign out
				</button>
			</form>
		</div>
	</div>
</div>
