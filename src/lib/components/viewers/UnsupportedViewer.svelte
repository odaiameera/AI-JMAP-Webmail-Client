<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	let { attachment, onDownload }: {
		attachment: ViewerAttachment;
		onDownload: () => void;
	} = $props();
</script>

<div class="w-full h-full flex items-center justify-center p-8">
	<div class="text-center max-w-md">
		<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-text-tertiary/10 flex items-center justify-center">
			<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-tertiary">
				<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
				<polyline points="14 2 14 8 20 8"/>
			</svg>
		</div>
		<h3 class="text-base font-semibold text-text mb-2">Can't preview this file</h3>
		<p class="text-sm text-text-tertiary mb-6">
			{attachment.name} ({attachment.type || 'unknown type'}) isn't supported by the built-in viewer.
		</p>
		<button
			onclick={onDownload}
			class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
		>
			Download to open externally
		</button>
	</div>
</div>
