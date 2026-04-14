import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.auth) {
		redirect(303, '/inbox');
	}
	redirect(303, '/login');
};
