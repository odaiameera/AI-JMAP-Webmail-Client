<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { ViewerAttachment } from '$lib/attachments/types';
	let { attachment, onDownload }: {
		attachment: ViewerAttachment;
		onDownload: () => void;
	} = $props();
</script>

<div class="w-full h-full flex items-center justify-center p-8">
	<div class="text-center max-w-md">
		<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-text-tertiary/10 flex items-center justify-center">
			<Icon name="file" size={20} class="text-text-tertiary" />
		</div>
		<h3 class="text-base font-semibold text-text mb-2">Can't preview this file</h3>
		<p class="text-sm text-text-tertiary mb-6">
			{attachment.name} ({attachment.type || 'unknown type'}) isn't supported by the built-in viewer.
		</p>
		<button
			onclick={onDownload}
			class="btn btn-primary btn-lg"
		>
			Download to open externally
		</button>
	</div>
</div>
