<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="min-h-screen flex items-center justify-center bg-bg">
	<div class="text-center">
		<h1 class="text-4xl font-bold text-text mb-2">{page.status}</h1>
		<p class="text-text-secondary">{page.error?.message ?? 'Something went wrong'}</p>
		<a href="/inbox" class="inline-block mt-6 text-accent-fg hover:text-accent-fg-hover transition-colors">
			Back to inbox
		</a>
	</div>
</div>
