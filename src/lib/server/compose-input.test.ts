import { describe, expect, it } from 'vitest';
import { parseDraftId, parseImportance, parseMessageIds } from './compose-input';

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
