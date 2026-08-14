import { describe, expect, it } from 'vitest';
import type { ContactCard } from '$lib/jmap/types';
import {
	batchContactImportForms,
	classifyContactImport,
	contactImportRequestBytes,
	parseContactImport
} from './import';

const appleVcard = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'UID:apple-ada',
	'FN:Ada Lovelace',
	'N:Lovelace;Ada;;;',
	'EMAIL;TYPE=WORK,PREF:ada@EXAMPLE.test',
	'EMAIL;TYPE=HOME:ada.home@example.test',
	'TEL;TYPE=CELL:+353875550100',
	'ORG:Analytical Engine',
	'NOTE:First programmer',
	'END:VCARD',
	'BEGIN:VCARD',
	'VERSION:3.0',
	'FN:No Address',
	'END:VCARD'
].join('\r\n');

const googleVcard = [
	'BEGIN:VCARD',
	'VERSION:4.0',
	'FN:Grace Hopper',
	'EMAIL;TYPE=work;PREF=1:grace@example.test',
	'TEL;TYPE=work:555-0100',
	'ORG:US Navy',
	'END:VCARD'
].join('\r\n');

const googleCsv = [
	'Name,Given Name,Family Name,Organization 1 - Name,E-mail 1 - Type,E-mail 1 - Value,E-mail 2 - Type,E-mail 2 - Value,Phone 1 - Type,Phone 1 - Value,Notes',
	'Katherine Johnson,Katherine,Johnson,NASA,Work,katherine@example.test,Home,kj@example.test,Mobile,+1 555 0101,"Orbital mechanics, Apollo"',
	',Margaret,Hamilton,MIT,Work,margaret@example.test,,,Work,+1 555 0102,'
].join('\n');

describe('contact import parsing', () => {
	it('parses a multi-contact Apple vCard export and preserves repeated values', () => {
		const result = parseContactImport('Apple Contacts.vcf', appleVcard, 'book-1');
		expect(result.format).toBe('vcard');
		expect(result.contacts).toHaveLength(2);
		expect(result.contacts[0]).toEqual(expect.objectContaining({
			sourceIndex: 1,
			sourceUid: 'apple-ada',
			form: {
				name: 'Ada Lovelace',
				emails: [
					{ address: 'ada@example.test', type: 'work', pref: 1 },
					{ address: 'ada.home@example.test', type: 'home' }
				],
				phones: [{ number: '+353875550100', type: 'other' }],
				organization: 'Analytical Engine',
				notes: 'First programmer',
				favorite: false,
				addressBookIds: ['book-1']
			}
		}));
		expect(result.contacts[1].form.name).toBe('No Address');
	});

	it('parses Google vCard and Google CSV exports', () => {
		const vcard = parseContactImport('contacts.vcf', googleVcard, 'book-1');
		expect(vcard.contacts[0].form).toEqual(expect.objectContaining({
			name: 'Grace Hopper',
			emails: [{ address: 'grace@example.test', type: 'work', pref: 1 }],
			organization: 'US Navy'
		}));

		const csv = parseContactImport('google.csv', googleCsv, 'book-1');
		expect(csv.format).toBe('google-csv');
		expect(csv.contacts).toHaveLength(2);
		expect(csv.contacts[0].form).toEqual({
			name: 'Katherine Johnson',
			emails: [
				{ address: 'katherine@example.test', type: 'work' },
				{ address: 'kj@example.test', type: 'home' }
			],
			phones: [{ number: '+1 555 0101', type: 'other' }],
			organization: 'NASA',
			notes: 'Orbital mechanics, Apollo',
			favorite: false,
			addressBookIds: ['book-1']
		});
		expect(csv.contacts[1].form.name).toBe('Margaret Hamilton');
	});

	it('marks duplicates against Stalwart and within the same file by normalized email', () => {
		const existing: ContactCard = {
			id: 'existing',
			'@type': 'Card',
			version: '1.0',
			uid: 'urn:uuid:existing',
			emails: { email1: { address: 'ADA@example.test' } },
			addressBookIds: { 'book-1': true }
		};
		const parsed = parseContactImport('Apple Contacts.vcf', appleVcard, 'book-1');
		parsed.contacts.push({
			...parsed.contacts[0],
			sourceIndex: 3,
			form: { ...parsed.contacts[0].form, name: 'Ada Duplicate' }
		});
		parsed.contacts.push({
			sourceIndex: 4,
			form: {
				name: '',
				emails: [{ address: 'not-an-email', type: 'other' }],
				phones: [],
				organization: '',
				notes: '',
				favorite: false,
				addressBookIds: ['book-1']
			}
		});

		const classified = classifyContactImport(parsed.contacts, [existing]);
		expect(classified.map((item) => item.status)).toEqual(['duplicate', 'ready', 'duplicate', 'invalid']);
		expect(classified[0].reason).toMatch(/existing contact/i);
		expect(classified[2].reason).toMatch(/earlier row/i);
		expect(classified[3].reason).toMatch(/invalid email/i);
	});

	it('rejects unsupported files and malformed card data explicitly', () => {
		expect(() => parseContactImport('contacts.txt', 'hello', 'book-1')).toThrow(/vCard.*CSV/i);
		expect(() => parseContactImport('contacts.vcf', 'not a vcard', 'book-1')).toThrow(/valid vCard/i);
	});

	it('rejects unsupported vCard versions instead of partially importing them', () => {
		const legacy = [
			'BEGIN:VCARD',
			'VERSION:2.1',
			'FN:Legacy Contact',
			'EMAIL:legacy@example.test',
			'END:VCARD'
		].join('\r\n');

		expect(() => parseContactImport('legacy.vcf', legacy, 'book-1'))
			.toThrow(/vCard 3\.0 or 4\.0/i);
	});

	it('rejects vCard PREF values outside the JSContact integer range', () => {
		for (const preference of ['0', '1.5', '101']) {
			const source = [
				'BEGIN:VCARD',
				'VERSION:4.0',
				'FN:Invalid Preference',
				`EMAIL;PREF=${preference}:person@example.test`,
				'END:VCARD'
			].join('\r\n');

			expect(() => parseContactImport('contacts.vcf', source, 'book-1'))
				.toThrow(/PREF.*integer.*1.*100/i);
		}
	});

	it('rejects a generic CSV that only happens to contain a Name column', () => {
		expect(() => parseContactImport('contacts.csv', 'Name\nAda Lovelace', 'book-1'))
			.toThrow(/Google Contacts export/i);
	});

	it('classifies a CSV field-count mismatch as invalid without discarding valid rows', () => {
		const source = [
			'Name,E-mail 1 - Value,Notes',
			'Ada,ada@example.test,ok,EXTRA',
			'Grace,grace@example.test,ok'
		].join('\n');
		const parsed = parseContactImport('google.csv', source, 'book-1');
		const classified = classifyContactImport(parsed.contacts, []);

		expect(classified.map((entry) => entry.status)).toEqual(['invalid', 'ready']);
		expect(classified[0].reason).toMatch(/malformed CSV row/i);
	});

	it('carries valid vCard email and phone preferences into the import form', () => {
		const source = [
			'BEGIN:VCARD',
			'VERSION:4.0',
			'FN:Preferred Contact',
			'EMAIL;TYPE=home:first@example.test',
			'EMAIL;TYPE=work;PREF=42:preferred@example.test',
			'TEL;TYPE=home:111',
			'TEL;TYPE=work;PREF=7:222',
			'END:VCARD'
		].join('\r\n');
		const form = parseContactImport('contacts.vcf', source, 'book-1').contacts[0].form;

		expect(form.emails).toEqual([
			{ address: 'preferred@example.test', type: 'work', pref: 42 },
			{ address: 'first@example.test', type: 'home' }
		]);
		expect(form.phones).toEqual([
			{ number: '222', type: 'work', pref: 7 },
			{ number: '111', type: 'home' }
		]);
	});

	it('batches imports by encoded request bytes as well as record count', () => {
		const form = {
			name: 'Large contact',
			emails: [{ address: 'large@example.test', type: 'other' as const }],
			phones: [],
			organization: '',
			notes: '💫'.repeat(100),
			favorite: false,
			addressBookIds: ['book-1']
		};
		const batches = batchContactImportForms([form, form, form], 50, 900);

		expect(batches.length).toBeGreaterThan(1);
		expect(batches.every((batch) => batch.length <= 50)).toBe(true);
		expect(batches.every((batch) => contactImportRequestBytes(batch) <= 900)).toBe(true);
	});
});
