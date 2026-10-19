import { describe, expect, it } from 'vitest';
import { AUTO_LABEL_COLORS, LABEL_COLORS, autoLabelColor } from './colors';

describe('autoLabelColor', () => {
	it('gives the same seed the same colour every time', () => {
		expect(autoLabelColor('ba').hex).toBe(autoLabelColor('ba').hex);
	});

	it('only hands out colours from the automatic palette', () => {
		for (const seed of ['a', 'q', 'bi', 'zz', '']) {
			expect(AUTO_LABEL_COLORS).toContain(autoLabelColor(seed));
		}
	});

	it('skips colours already taken, so labels shown together differ', () => {
		const taken = new Set<string>();
		const seen: string[] = [];
		for (const id of ['1', '2', '3', '4', '5', '6', '7']) {
			const hex = autoLabelColor(id, taken).hex.toLowerCase();
			taken.add(hex);
			seen.push(hex);
		}
		expect(new Set(seen).size).toBe(seen.length);
	});

	it('still returns a colour once the whole palette is taken', () => {
		const taken = new Set(AUTO_LABEL_COLORS.map((c) => c.hex.toLowerCase()));
		expect(AUTO_LABEL_COLORS).toContain(autoLabelColor('x', taken));
	});

	it('draws every automatic colour from the swatch grid', () => {
		for (const c of AUTO_LABEL_COLORS) expect(LABEL_COLORS).toContain(c);
	});
});
