<script lang="ts">
	let { initialTheme = 'dark' }: { initialTheme?: string } = $props();
	let theme = $state(initialTheme);

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
</script>

<div class="w-[52px] shrink-0 bg-surface border-r border-border flex flex-col items-center py-3 gap-1 h-full">
	<!-- Active app: Mail / AI -->
	<button class="w-9 h-9 rounded-lg flex items-center justify-center text-accent bg-accent/10" title="Mail">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
		</svg>
	</button>

	<!-- Placeholder: Contacts -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
		</svg>
	</div>

	<!-- Placeholder: Tasks -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
		</svg>
	</div>

	<!-- Placeholder: Calendar -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
		</svg>
	</div>

	<div class="mt-auto"></div>

	<!-- Theme toggle -->
	<button onclick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
		class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer">
		{#if theme === 'dark'}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
			</svg>
		{:else}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
			</svg>
		{/if}
	</button>
</div>
