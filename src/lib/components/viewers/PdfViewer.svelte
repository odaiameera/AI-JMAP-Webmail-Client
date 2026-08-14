<script lang="ts">
	import type { ViewerAttachment } from '$lib/attachments/types';
	import { attachmentUrl } from '$lib/attachments/fetch';

	let { attachment }: { attachment: ViewerAttachment } = $props();
	const src = $derived(attachmentUrl(attachment.emailId, attachment.blobId, attachment.name, 'inline'));
</script>

<iframe
	{src}
	title={attachment.name}
	class="w-full h-full border-none"
></iframe>
