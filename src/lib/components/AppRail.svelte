<script lang="ts">
	let { initialTheme = 'dark', settingsOpen = false, onToggleSettings }: {
		initialTheme?: string;
		settingsOpen?: boolean;
		onToggleSettings?: () => void;
	} = $props();
</script>

<div class="w-[52px] shrink-0 bg-surface flex flex-col items-center py-3 gap-1 overflow-hidden">
	<!-- Mail (active) -->
	<button class="w-9 h-9 rounded-lg flex items-center justify-center text-accent bg-accent/10" title="Mail">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/>
		</svg>
	</button>

	<!-- AI -->
	<button class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer" title="AI">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
		</svg>
	</button>

	<!-- Placeholder: Contacts -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
		</svg>
	</div>

	<!-- Placeholder: Tasks -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
		</svg>
	</div>

	<!-- Placeholder: Calendar -->
	<div class="w-9 h-9 rounded-lg flex items-center justify-center text-text-tertiary opacity-50 cursor-not-allowed" title="Coming soon">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
		</svg>
	</div>

	<!-- Settings -->
	<div class="h-px w-6 bg-border/30 my-1"></div>
	<button onclick={(e) => { e.stopPropagation(); onToggleSettings?.(); }} title="Settings"
		class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer
			{settingsOpen ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text hover:bg-surface-hover'}">
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
	</button>
</div>
