<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$lib/utils/title';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Sign in' })}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<h1 class="text-2xl font-bold text-text">ameera. <span class="text-text-tertiary font-normal">Mail</span></h1>
			<p class="text-text-tertiary mt-1 text-sm">Sign in to your account</p>
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
				<div class="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
					{form.error}
				</div>
			{/if}

			<div>
				<label for="email" class="block text-sm text-text-secondary mb-1.5">Username or email</label>
				<input
					id="email"
					name="email"
					type="text"
					autocomplete="username"
					required
					value={form?.email ?? ''}
					class="w-full bg-white/5 border border-border rounded-lg px-3.5 py-2.5 text-text
						focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
				/>
			</div>

			<div>
				<label for="password" class="block text-sm text-text-secondary mb-1.5">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="w-full bg-white/5 border border-border rounded-lg px-3.5 py-2.5 text-text
						focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg
					px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
			>
				{loading ? 'Signing in...' : 'Sign in'}
			</button>
		</form>
	</div>
</div>
