import type { PageServerLoad } from './$types';
import { getJevSettings } from '$lib/server/db/queries/jev-settings';
import { jevMode } from '$lib/server/jev/client';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { rules, labels, mailboxes } = await parent();
	return {
		rules: rules ?? [],
		labels: labels ?? [],
		mailboxes: mailboxes ?? [],
		// Whether rules with a Jev condition can run for the account in use.
		jev: {
			mode: jevMode(),
			enabled: locals.activeAccountId ? getJevSettings(locals.activeAccountId).jevEnabled : false
		}
	};
};
