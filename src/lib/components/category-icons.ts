import type { IconName } from '$lib/icons';
import type { InboxCategory } from '$lib/types/categories';

/**
 * Each Inbox tab's icon, shared by the tabs, the "Move to tab" picker and
 * Jev's settings so a category looks the same everywhere.
 */
export const CATEGORY_ICON: Record<InboxCategory, IconName> = {
	important: 'tab-important',
	updates: 'tab-updates',
	newsletters: 'tab-newsletters',
	promotions: 'tab-promotions'
};
