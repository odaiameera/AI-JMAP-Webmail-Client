/** Send later choices and how send times read, in the viewer's time zone. */

export interface SendLaterPreset {
	label: string;
	at: Date;
}

function atHour(day: Date, hour: number): Date {
	const d = new Date(day);
	d.setHours(hour, 0, 0, 0);
	return d;
}

function addDays(day: Date, n: number): Date {
	const d = new Date(day);
	d.setDate(d.getDate() + n);
	return d;
}

/** Tomorrow morning and afternoon, and Monday morning unless that's tomorrow. */
export function sendLaterPresets(now: Date): SendLaterPreset[] {
	const tomorrow = addDays(now, 1);
	const presets = [
		{ label: 'Tomorrow morning', at: atHour(tomorrow, 8) },
		{ label: 'Tomorrow afternoon', at: atHour(tomorrow, 13) }
	];
	const daysToMonday = (8 - now.getDay()) % 7 || 7;
	if (daysToMonday > 1) presets.push({ label: 'Monday morning', at: atHour(addDays(now, daysToMonday), 8) });
	return presets;
}

function sameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 3:00 PM", "Tomorrow, 8:00 AM", "Mon, 8:00 AM", "Nov 3, 8:00 AM". */
export function formatSendTime(at: Date, now = new Date()): string {
	const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	if (sameDay(at, now)) return `Today, ${time}`;
	if (sameDay(at, addDays(now, 1))) return `Tomorrow, ${time}`;
	const days = (atHour(at, 0).getTime() - atHour(now, 0).getTime()) / 86_400_000;
	if (days > 0 && days < 7) return `${at.toLocaleDateString('en-US', { weekday: 'short' })}, ${time}`;
	return formatSendDate(at, now);
}

/** "Oct 20, 8:00 AM": the date itself, beside a label that already names the day. */
export function formatSendDate(at: Date, now = new Date()): string {
	const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	const date = at.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(at.getFullYear() !== now.getFullYear() && { year: 'numeric' })
	});
	return `${date}, ${time}`;
}

/** `YYYY-MM-DD` and `HH:MM` for date and time inputs, in local time. */
export function toInputValues(at: Date): { date: string; time: string } {
	const pad = (n: number) => String(n).padStart(2, '0');
	return {
		date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
		time: `${pad(at.getHours())}:${pad(at.getMinutes())}`
	};
}

/** The local moment a date input and a time input name, or null. */
export function fromInputValues(date: string, time: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const t = /^(\d{2}):(\d{2})$/.exec(time);
	if (!m || !t) return null;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
	return Number.isNaN(d.getTime()) ? null : d;
}
