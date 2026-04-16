<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();
</script>

<svelte:head><title>{pageTitle({ page: 'Security', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Security</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Password, two-factor authentication, app passwords, and session management are handled by your
		mail server's self-service portal — Ameera can't change them directly because Stalwart doesn't
		expose those operations over JMAP.
	</p>
</header>

<section class="space-y-4">
	<div class="rounded-xl border border-border bg-surface-hover/40 p-5 flex items-start gap-4">
		<div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
			<svg class="text-accent" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"/>
			</svg>
		</div>
		<div class="flex-1 min-w-0">
			<p class="text-sm font-semibold text-text">Stalwart self-service portal</p>
			<p class="text-xs text-text-tertiary mt-1 mb-3">
				Change your password, enable TOTP, generate app passwords for clients like Apple Mail or
				Thunderbird, and manage active sessions.
			</p>
			<a
				href={data.stalwartPortalUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors"
			>
				Open portal
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><polyline points="7 7 17 7 17 17"/></svg>
			</a>
		</div>
	</div>

	<div class="text-xs text-text-tertiary space-y-1 pl-1">
		<p>Not yet supported by Stalwart JMAP and therefore not available here:</p>
		<ul class="list-disc list-inside pl-2">
			<li>Passkeys / WebAuthn</li>
			<li>Email identities and aliases</li>
			<li>Domain management</li>
			<li>Signed / encrypted mail (PGP, S/MIME)</li>
		</ul>
	</div>
</section>
