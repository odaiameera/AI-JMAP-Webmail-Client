import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const KNOWN = new Set(['ai', 'contacts', 'tasks']);

export const load: PageLoad = ({ params }) => {
	// Calendar and Contacts graduated from placeholders to real apps.
	if (params.slug === 'ai') {
		redirect(302, '/inbox?assistant=open');
	}
	if (params.slug === 'calendar') {
		redirect(301, '/calendar');
	}
	if (params.slug === 'contacts') {
		redirect(301, '/contacts');
	}
	return {
		slug: params.slug,
		known: KNOWN.has(params.slug)
	};
};
