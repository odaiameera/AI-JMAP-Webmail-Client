import { describe, expect, it } from 'vitest';
import {
	DEFAULT_UNDO_SEND_SECONDS,
	parseDraftId,
	parseImportance,
	parseMessageIds,
	parseSendAt,
	parseUndoSendSeconds
} from './compose-input';

describe('parseMessageIds', () => {
	it('strips angle brackets and splits References on whitespace', () => {
		expect(parseMessageIds('<a@x.test>  <b@x.test>\n<c@x.test>')).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
	});

	it('drops values that are not Message-IDs, like a JMAP email id', () => {
		expect(parseMessageIds('Mabc123 <ok@x.test>')).toEqual(['ok@x.test']);
		expect(parseMessageIds(undefined)).toEqual([]);
	});
});

describe('parseImportance', () => {
	it('only accepts high or low; anything else is normal', () => {
		expect(parseImportance('high')).toBe('high');
		expect(parseImportance('low')).toBe('low');
		expect(parseImportance('urgent')).toBe('normal');
		expect(parseImportance(undefined)).toBe('normal');
	});
});

describe('parseDraftId', () => {
	it('accepts JMAP ids only', () => {
		expect(parseDraftId('3gqaaahzu')).toBe('3gqaaahzu');
		expect(parseDraftId('../x')).toBeUndefined();
		expect(parseDraftId(42)).toBeUndefined();
	});
});

describe('parseSendAt', () => {
	const now = Date.parse('2026-10-19T12:00:00Z');

	it('means now when nothing is given', () => {
		expect(parseSendAt(undefined, now)).toBeNull();
		expect(parseSendAt('', now)).toBeNull();
		expect(parseSendAt(null, now)).toBeNull();
	});

	it('accepts a future time within a year', () => {
		expect(parseSendAt('2026-10-20T08:00:00Z', now)).toEqual(new Date('2026-10-20T08:00:00Z'));
	});

	it('rejects past, far-off and malformed times', () => {
		expect(parseSendAt('2026-10-19T11:59:00Z', now)).toBe('invalid');
		expect(parseSendAt('2028-01-01T00:00:00Z', now)).toBe('invalid');
		expect(parseSendAt('tomorrow', now)).toBe('invalid');
		expect(parseSendAt(1760000000000, now)).toBe('invalid');
	});
});

describe('parseUndoSendSeconds', () => {
	it('reads a stored choice, including off', () => {
		expect(parseUndoSendSeconds('20')).toBe(20);
		expect(parseUndoSendSeconds('0')).toBe(0);
		expect(parseUndoSendSeconds(5)).toBe(5);
	});

	it('falls back to the default for anything else', () => {
		expect(parseUndoSendSeconds(undefined)).toBe(DEFAULT_UNDO_SEND_SECONDS);
		expect(parseUndoSendSeconds('')).toBe(DEFAULT_UNDO_SEND_SECONDS);
		expect(parseUndoSendSeconds('7')).toBe(DEFAULT_UNDO_SEND_SECONDS);
		expect(parseUndoSendSeconds('abc')).toBe(DEFAULT_UNDO_SEND_SECONDS);
	});
});
