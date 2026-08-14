<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$lib/utils/title';
	import { LABEL_COLORS, DEFAULT_LABEL_COLOR } from '$lib/constants/colors';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	let color = $state(DEFAULT_LABEL_COLOR.hex);
	let showServerUrl = $state(!data.defaultServerUrl);

	const inputClass =
		'w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-text ' +
		'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors';
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Setup' })}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<h1 class="text-2xl font-bold text-text">ameera. <span class="text-text-tertiary font-normal">Mail</span></h1>
			{#if data.step === 'create'}
				<p class="text-text-tertiary mt-1 text-sm">Welcome — create your webmail login</p>
			{:else}
				<p class="text-text-tertiary mt-1 text-sm">Link your first mail account</p>
			{/if}
		</div>

		{#if form?.error}
			<div class="bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg px-4 py-3 mb-4">
				{form.error}
			</div>
		{/if}

		{#if data.step === 'create'}
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="email" class="block text-sm text-text-secondary mb-1.5">Login email</label>
					<input id="email" name="email" type="email" autocomplete="username" required
						value={form?.email ?? ''} class={inputClass} />
					<p class="text-xs text-text-tertiary mt-1.5">
						This is your webmail sign-in, separate from your mail accounts' passwords.
					</p>
				</div>
				<div>
					<label for="password" class="block text-sm text-text-secondary mb-1.5">Master password</label>
					<input id="password" name="password" type="password" autocomplete="new-password"
						required minlength="8" class={inputClass} />
				</div>
				<div>
					<label for="confirm" class="block text-sm text-text-secondary mb-1.5">Confirm password</label>
					<input id="confirm" name="confirm" type="password" autocomplete="new-password"
						required minlength="8" class={inputClass} />
				</div>
				<button type="submit" disabled={loading}
					class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg
						px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed">
					{loading ? 'Creating…' : 'Continue'}
				</button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/link"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="email" class="block text-sm text-text-secondary mb-1.5">Mail address</label>
					<input id="email" name="email" type="email" autocomplete="email" required
						value={form?.email ?? ''} class={inputClass} placeholder="you@yourdomain.com" />
				</div>
				<div>
					<label for="password" class="block text-sm text-text-secondary mb-1.5">Mail account password</label>
					<input id="password" name="password" type="password" autocomplete="current-password"
						required class={inputClass} />
					<p class="text-xs text-text-tertiary mt-1.5">
						Verified against your mail server, then stored encrypted.
					</p>
				</div>

				{#if showServerUrl}
					<div>
						<label for="serverUrl" class="block text-sm text-text-secondary mb-1.5">Mail server URL</label>
						<input id="serverUrl" name="serverUrl" type="url" required={!data.defaultServerUrl}
							value={data.defaultServerUrl} class={inputClass} placeholder="https://mail.example.com" />
					</div>
				{:else}
					<input type="hidden" name="serverUrl" value={data.defaultServerUrl} />
					<button type="button" onclick={() => (showServerUrl = true)}
						class="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer">
						Using {data.defaultServerUrl} — change
					</button>
				{/if}

				<div>
					<span class="block text-sm text-text-secondary mb-1.5">Account color</span>
					<input type="hidden" name="color" value={color} />
					<div class="grid grid-cols-10 gap-1.5">
						{#each LABEL_COLORS as c (c.hex)}
							<button type="button" title={c.name} aria-label={c.name}
								onclick={() => (color = c.hex)}
								class="w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110
									{color === c.hex ? 'ring-2 ring-offset-2 ring-offset-surface ring-text' : ''}"
								style="background-color: {c.hex}"></button>
						{/each}
					</div>
				</div>

				<button type="submit" disabled={loading}
					class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium rounded-lg
						px-4 py-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed">
					{loading ? 'Verifying…' : 'Link account'}
				</button>
			</form>
		{/if}
	</div>
</div>
