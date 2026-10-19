import { createRequire } from 'node:module';
import type { IconNode } from '$lib/types/icon-node';

/**
 * The Lucide set, for the icons people pick for their folders and labels.
 * Only a name is stored, and only a name the set has; the drawing sent to
 * the browser always comes from here, never from what a browser sent.
 */
// require, not import: Node won't import a package's JSON without an import
// attribute, which would break the production server; require reads it.
const NODES = createRequire(import.meta.url)('lucide-static/icon-nodes.json') as Record<string, IconNode>;

/** A stored icon of '' means "none": the plain folder, or the label's dot. */
export const NO_ICON = '';

export function isLucideIcon(name: unknown): name is string {
	return typeof name === 'string' && /^[a-z0-9-]{1,64}$/.test(name) && Object.hasOwn(NODES, name);
}

/** The drawing for a stored icon name, or null for none or an unknown name. */
export function lucideNode(name: string | null | undefined): IconNode | null {
	return name && Object.hasOwn(NODES, name) ? NODES[name] : null;
}

/**
 * Read an icon from a request body: undefined leaves it as it is, '' or
 * null clears it, a known name sets it, and anything else is invalid.
 */
export function parseIconPatch(input: unknown): string | undefined | 'invalid' {
	if (input === undefined) return undefined;
	if (input === null || input === NO_ICON) return NO_ICON;
	return isLucideIcon(input) ? input : 'invalid';
}
