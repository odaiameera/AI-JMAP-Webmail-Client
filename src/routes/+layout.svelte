<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<!-- PWA head (manifest, theme-color, icons) lives in src/app.html as the single
     source of truth — keeping it here too caused a duplicate, conflicting
     theme-color and a stale favicon. -->
{@render children()}
