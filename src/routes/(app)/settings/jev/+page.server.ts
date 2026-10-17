import type { PageServerLoad } from './$types';
import { getJevSettings } from '$lib/server/db/queries/jev-settings';

export const load: PageServerLoad = async ({ parent }) => {
	const { accounts, activeAccountId } = await parent();
	return {
		jevAccounts: (accounts ?? []).map((a) => ({
			id: a.id,
			email: a.email,
			displayName: a.displayName,
			color: a.color,
			isActive: a.id === activeAccountId,
			...getJevSettings(a.id)
		}))
	};
};
