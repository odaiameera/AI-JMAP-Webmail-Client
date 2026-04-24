/**
 * Curated 20-color palette for folder and label swatches. Each color has a
 * display name (shown next to "Color:" in the create/edit modal header) and
 * a hex value stored in user-state meta. The first row matches the brand
 * accent so the default selection feels continuous with the rest of the UI.
 */
export type LabelColor = {
	name: string;
	hex: string;
};

export const LABEL_COLORS: LabelColor[] = [
	{ name: 'Lavender', hex: '#A78BFA' },
	{ name: 'Rose', hex: '#F9A8D4' },
	{ name: 'Coral', hex: '#FB7185' },
	{ name: 'Amber', hex: '#FBBF24' },
	{ name: 'Sand', hex: '#D6B28A' },

	{ name: 'Violet', hex: '#8B5CF6' },
	{ name: 'Fuchsia', hex: '#D946EF' },
	{ name: 'Crimson', hex: '#E11D48' },
	{ name: 'Orange', hex: '#F97316' },
	{ name: 'Taupe', hex: '#A8A29E' },

	{ name: 'Blue', hex: '#3B82F6' },
	{ name: 'Sky', hex: '#0EA5E9' },
	{ name: 'Teal', hex: '#14B8A6' },
	{ name: 'Emerald', hex: '#10B981' },
	{ name: 'Lime', hex: '#84CC16' },

	{ name: 'Indigo', hex: '#4F46E5' },
	{ name: 'Cyan', hex: '#06B6D4' },
	{ name: 'Pine', hex: '#047857' },
	{ name: 'Forest', hex: '#166534' },
	{ name: 'Olive', hex: '#65A30D' }
];

export const DEFAULT_LABEL_COLOR: LabelColor = LABEL_COLORS[5];

export function colorByHex(hex: string): LabelColor {
	const match = LABEL_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
	return match ?? { name: 'Custom', hex };
}
