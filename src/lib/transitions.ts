import { cubicOut } from 'svelte/easing';

/**
 * How the corner windows (the composer popup and Raven) come and
 * go: a fade with a slight grow from the corner they're anchored to. The
 * agent's card does the same with CSS transitions, at the same timings.
 *
 * Any transform the element already has (the full-screen composer is
 * centred with one) is kept and the scale is added to it.
 */
export function cornerWindow(
	node: Element,
	{ duration = 200, easing = cubicOut, start = 0.95 }: { duration?: number; easing?: (t: number) => number; start?: number } = {}
) {
	const existing = getComputedStyle(node).transform;
	const base = existing === 'none' ? '' : existing;
	return {
		duration,
		easing,
		css: (t: number) => `opacity: ${t}; transform: ${base} scale(${start + (1 - start) * t});`
	};
}
