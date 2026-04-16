import type { PageLoad } from './$types';

const KNOWN = new Set(['ai', 'contacts', 'tasks', 'calendar']);

export const load: PageLoad = ({ params }) => {
	return {
		slug: params.slug,
		known: KNOWN.has(params.slug)
	};
};
