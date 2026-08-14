import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The (app) layout routes signed-in users without a working mail
	// account on to /setup or /reauth as appropriate.
	if (locals.user) {
		redirect(303, '/inbox');
	}
	redirect(303, '/login');
};
