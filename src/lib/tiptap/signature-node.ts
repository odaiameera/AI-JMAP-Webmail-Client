import { Node } from '@tiptap/core';

/**
 * A block-level Tiptap node that renders as `<div class="ameera-signature">…</div>`
 * and preserves that wrapper on serialization. Used by the composer to mark
 * the signature region so it can be replaced cleanly when the user picks a
 * different signature from the dropdown.
 */
export const SignatureNode = Node.create({
	name: 'signature',
	group: 'block',
	content: 'block+',
	defining: true,

	parseHTML() {
		return [{ tag: 'div.ameera-signature' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', { ...HTMLAttributes, class: 'ameera-signature' }, 0];
	}
});
