import { describe, expect, it } from 'vitest';
import { formatSendDate, formatSendTime, fromInputValues, sendLaterPresets, toInputValues } from './send-later';

// Local-time constructors throughout, so the tests hold in any time zone.
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('sendLaterPresets', () => {
	it('offers tomorrow morning, tomorrow afternoon and Monday morning midweek', () => {
		const presets = sendLaterPresets(local(2026, 10, 21, 15, 30)); // Wednesday
		expect(presets.map((p) => p.label)).toEqual(['Tomorrow morning', 'Tomorrow afternoon', 'Monday morning']);
		expect(presets[0].at).toEqual(local(2026, 10, 22, 8));
		expect(presets[1].at).toEqual(local(2026, 10, 22, 13));
		expect(presets[2].at).toEqual(local(2026, 10, 26, 8));
	});

	it('leaves out Monday morning on Sunday, when it is tomorrow morning', () => {
		const presets = sendLaterPresets(local(2026, 10, 25, 20)); // Sunday
		expect(presets.map((p) => p.label)).toEqual(['Tomorrow morning', 'Tomorrow afternoon']);
	});

	it('means next week’s Monday when asked on a Monday', () => {
		const presets = sendLaterPresets(local(2026, 10, 19, 9)); // Monday
		expect(presets[2].at).toEqual(local(2026, 10, 26, 8));
	});
});

describe('formatSendTime', () => {
	const now = local(2026, 10, 19, 10); // Monday

	it('names today and tomorrow', () => {
		expect(formatSendTime(local(2026, 10, 19, 15), now)).toBe('Today, 3:00 PM');
		expect(formatSendTime(local(2026, 10, 20, 8), now)).toBe('Tomorrow, 8:00 AM');
	});

	it('uses the weekday within the week, then the date', () => {
		expect(formatSendTime(local(2026, 10, 23, 8), now)).toBe('Fri, 8:00 AM');
		expect(formatSendTime(local(2026, 11, 3, 8), now)).toBe('Nov 3, 8:00 AM');
		expect(formatSendTime(local(2027, 1, 4, 9, 30), now)).toBe('Jan 4, 2027, 9:30 AM');
	});

	it('can give the date even for tomorrow', () => {
		expect(formatSendDate(local(2026, 10, 20, 8), now)).toBe('Oct 20, 8:00 AM');
	});
});

describe('input values', () => {
	it('round-trips a local moment', () => {
		const at = local(2026, 3, 7, 9, 5);
		expect(toInputValues(at)).toEqual({ date: '2026-03-07', time: '09:05' });
		expect(fromInputValues('2026-03-07', '09:05')).toEqual(at);
	});

	it('rejects missing parts', () => {
		expect(fromInputValues('', '09:00')).toBeNull();
		expect(fromInputValues('2026-03-07', '')).toBeNull();
	});
});
