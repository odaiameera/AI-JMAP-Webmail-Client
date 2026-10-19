import { describe, expect, it } from 'vitest';
import { isLucideIcon, lucideNode, NO_ICON, parseIconPatch } from './lucide-icons';

describe('folder and label icons', () => {
	it('knows Lucide’s icons by name', () => {
		expect(isLucideIcon('briefcase')).toBe(true);
		expect(isLucideIcon('not-an-icon')).toBe(false);
		expect(isLucideIcon('constructor')).toBe(false);
		expect(isLucideIcon('<svg>')).toBe(false);
		expect(isLucideIcon(42)).toBe(false);
	});

	it('gives the drawing for a stored name, and none for none', () => {
		const node = lucideNode('briefcase');
		expect(Array.isArray(node) && node.length > 0).toBe(true);
		expect(node?.every(([tag]) => ['path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse'].includes(tag))).toBe(true);
		expect(lucideNode(NO_ICON)).toBeNull();
		expect(lucideNode(null)).toBeNull();
		expect(lucideNode('toString')).toBeNull();
	});

	it('reads a request’s icon: leave, clear, set, or refuse', () => {
		expect(parseIconPatch(undefined)).toBeUndefined();
		expect(parseIconPatch(null)).toBe(NO_ICON);
		expect(parseIconPatch('')).toBe(NO_ICON);
		expect(parseIconPatch('plane')).toBe('plane');
		expect(parseIconPatch('plane"><script>')).toBe('invalid');
	});
});
