import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const KNOWN = new Set(['ai', 'contacts', 'tasks']);

export const load: PageLoad = ({ params }) => {
	// Calendar graduated from placeholder to a real app.
	if (params.slug === 'calendar') {
		redirect(301, '/calendar');
	}
	return {
		slug: params.slug,
		known: KNOWN.has(params.slug)
	};
};
