import type { PageServerLoad } from './$types';
import { getJevSettings } from '$lib/server/db/queries/jev-settings';
import { jevMode } from '$lib/server/jev/client';
import { ruleStats } from '$lib/server/db/queries/jev-learning';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { rules, labels, mailboxes } = await parent();
	return {
		rules: rules ?? [],
		labels: labels ?? [],
		mailboxes: mailboxes ?? [],
		// Whether rules with a Jev condition can run for the account in use.
		jev: {
			mode: jevMode(),
			enabled: locals.activeAccountId ? getJevSettings(locals.activeAccountId).jevEnabled : false,
			// Per rule: emails it fired on through Jev, and how many you marked wrong.
			stats: locals.activeAccountId ? ruleStats(locals.activeAccountId) : {}
		}
	};
};
