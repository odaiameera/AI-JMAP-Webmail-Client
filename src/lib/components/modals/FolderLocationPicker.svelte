<script lang="ts">
	import type { Mailbox } from '$lib/jmap/types';
	import {
		buildFolderTree,
		descendantIds,
		flattenFolderTree,
		type FolderOption
	} from '$lib/utils/folder-tree';

	let {
		value,
		mailboxes,
		excludeId = null,
		onChange
	}: {
		value: string | null;
		mailboxes: Mailbox[];
		excludeId?: string | null;
		onChange: (parentId: string | null) => void;
	} = $props();

	const options = $derived.by<FolderOption[]>(() => {
		const tree = buildFolderTree(mailboxes);
		const flat = flattenFolderTree(tree);
		if (!excludeId) return flat;
		const excluded = descendantIds(mailboxes, excludeId);
		return flat.filter((opt) => !excluded.has(opt.id));
	});
</script>

<select
	class="w-full appearance-none bg-surface-hover border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-text outline-none focus:border-accent transition-colors"
	value={value ?? ''}
	onchange={(e) => onChange(e.currentTarget.value || null)}
	style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>'); background-repeat: no-repeat; background-position: right 0.65rem center;"
>
	<option value="">No parent folder</option>
	{#each options as opt (opt.id)}
		<option value={opt.id}>
			{'— '.repeat(opt.depth)}{opt.name}
		</option>
	{/each}
</select>
