/**
 * Outlook-style date bucketing for the email list: every email sits in a
 * group keyed by its local calendar day, and the group header reads
 * "Today", "Yesterday", or a weekday + date like "Monday, March 20".
 *
 * The bucket depends on "today" at read time, so callers pass a `now`
 * argument (pulled from the $now store) to get labels that roll over
 * across midnight without a page reload.
 */

export type DateBucket = {
	/** Stable id — `today`, `yesterday`, or `YYYY-MM-DD`. Used for collapse state + keys. */
	key: string;
	/** Human-readable header: "Today", "Yesterday", "Monday, March 20". */
	label: string;
	/** Sort key: midnight of the bucket's day in ms. Newer buckets come first. */
	sortKey: number;
};

function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function bucketFor(receivedAt: string | number | Date, nowMs: number): DateBucket {
	const d = new Date(receivedAt);
	const today = new Date(nowMs);
	const todayStart = startOfDay(today);
	const dStart = startOfDay(d);
	const diffDays = Math.round((todayStart - dStart) / 86_400_000);

	if (diffDays === 0) return { key: 'today', label: 'Today', sortKey: dStart };
	if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday', sortKey: dStart };

	const sameYear = d.getFullYear() === today.getFullYear();
	const label = d.toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' })
	});
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return { key: `${y}-${m}-${day}`, label, sortKey: dStart };
}

/**
 * Short time-of-day label, e.g. "2:30 PM" — used as the per-row
 * timestamp once emails are already grouped by date.
 */
export function formatTimeOfDay(receivedAt: string | number | Date): string {
	return new Date(receivedAt).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit'
	});
}
