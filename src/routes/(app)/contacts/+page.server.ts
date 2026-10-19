import type { PageServerLoad } from './$types';
import type { ContactsLoadResponse } from '$lib/contacts/api';
import { loadAllContacts } from '$lib/server/contacts-load';

/**
 * Contacts come with the page instead of being asked for once it's open.
 * A full page load waits for them, so the page arrives filled in. Coming
 * from another page (or hovering the link, which preloads) streams them,
 * so the switch is immediate and the last list shows until they land. A
 * failure hands over null and the page loads them itself, with its usual
 * error and retry.
 */
export const load: PageServerLoad = async ({ locals, isDataRequest }) => {
	if (!locals.auth) return { contacts: null };
	const contacts: Promise<ContactsLoadResponse | null> = loadAllContacts(locals.auth).catch(() => null);
	return { contacts: isDataRequest ? contacts : await contacts };
};
