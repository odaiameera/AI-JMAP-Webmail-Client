<script lang="ts">
	import { realtime } from '$lib/stores/realtime';
</script>

<div
	class="flex items-center gap-1.5 text-xs text-text-tertiary select-none"
	title={$realtime.connected ? 'Real-time updates active' : 'Reconnecting…'}
>
	<span
		class="w-1.5 h-1.5 rounded-full transition-colors
			{$realtime.connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}"
	></span>
	<span class="hidden md:inline">
		{$realtime.connected ? 'Live' : 'Reconnecting'}
	</span>
</div>
