/**
 * A Lucide drawing as data: its SVG elements and their attributes, in a
 * 24×24 box. Folder and label icons travel this way, so any of the ~1,900
 * icons can be drawn without shipping them all.
 */
export type IconNode = [string, Record<string, string>][];
