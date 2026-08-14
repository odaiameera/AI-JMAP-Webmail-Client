import ICAL from 'ical.js';
import Papa from 'papaparse';
import type { ContactCard } from '$lib/jmap/types';
import type { ContactEntryType, ContactFormValue } from './model';

export type ContactImportFormat = 'vcard' | 'google-csv';

export const MAX_IMPORT_BATCH_CONTACTS = 50;
export const MAX_IMPORT_BATCH_BYTES = 400 * 1024;

export interface ContactImportCandidate {
	sourceIndex: number;
	sourceUid?: string;
	parseError?: string;
	form: ContactFormValue;
}

export interface ParsedContactImport {
	format: ContactImportFormat;
	contacts: ContactImportCandidate[];
	warnings: string[];
}

export interface ClassifiedContactImport extends ContactImportCandidate {
	status: 'ready' | 'duplicate' | 'invalid';
	reason?: string;
}

export function contactImportRequestBytes(contacts: ContactFormValue[]): number {
	return new TextEncoder().encode(JSON.stringify({ action: 'import', contacts })).byteLength;
}

export function batchContactImportForms(
	forms: ContactFormValue[],
	maxCount = MAX_IMPORT_BATCH_CONTACTS,
	maxBytes = MAX_IMPORT_BATCH_BYTES
): ContactFormValue[][] {
	if (!Number.isInteger(maxCount) || maxCount < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) {
		throw new Error('Import batch limits must be positive integers.');
	}

	const batches: ContactFormValue[][] = [];
	let current: ContactFormValue[] = [];
	for (const form of forms) {
		const candidate = [...current, form];
		if (candidate.length <= maxCount && contactImportRequestBytes(candidate) <= maxBytes) {
			current = candidate;
			continue;
		}
		if (current.length > 0) batches.push(current);
		current = [form];
		if (contactImportRequestBytes(current) > maxBytes) {
			throw new Error('A contact is too large to import.');
		}
	}
	if (current.length > 0) batches.push(current);
	return batches;
}

function text(value: unknown): string {
	if (Array.isArray(value)) return value.map((part) => text(part)).filter(Boolean).join(' ').trim();
	return typeof value === 'string' ? value.trim() : '';
}

function parameterValues(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap((entry) => parameterValues(entry));
	return typeof value === 'string'
		? value.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
		: [];
}

function importEntryType(value: unknown): ContactEntryType {
	const values = parameterValues(value);
	if (values.includes('work')) return 'work';
	if (values.includes('home')) return 'home';
	return 'other';
}

function importPreference(property: ICAL.Property): number | undefined {
	const raw = property.getParameter('pref');
	if (raw !== undefined && raw !== null && raw !== '') {
		const numeric = Number(Array.isArray(raw) ? raw[0] : raw);
		if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 100) return numeric;
		throw new Error('vCard PREF must be an integer from 1 to 100.');
	}
	if (parameterValues(property.getParameter('type')).includes('pref')) return 1;
	return undefined;
}

function normalizeEmails(values: Array<{ address: string; type: ContactEntryType; preference?: number }>) {
	const seen = new Set<string>();
	return [...values]
		.sort((left, right) =>
			(left.preference ?? Number.MAX_SAFE_INTEGER) - (right.preference ?? Number.MAX_SAFE_INTEGER)
		)
		.flatMap((entry) => {
			const address = entry.address.trim().toLowerCase();
			if (!address || seen.has(address)) return [];
			seen.add(address);
			return [{
				address,
				type: entry.type,
				...(entry.preference !== undefined && { pref: entry.preference })
			}];
		});
}

function normalizePhones(values: Array<{ number: string; type: ContactEntryType; preference?: number }>) {
	const seen = new Set<string>();
	return [...values]
		.sort((left, right) =>
			(left.preference ?? Number.MAX_SAFE_INTEGER) - (right.preference ?? Number.MAX_SAFE_INTEGER)
		)
		.flatMap((entry) => {
			const number = entry.number.trim();
			if (!number || seen.has(number)) return [];
			seen.add(number);
			return [{
				number,
				type: entry.type,
				...(entry.preference !== undefined && { pref: entry.preference })
			}];
		});
}

function cardDisplayName(card: ICAL.Component): string {
	const formatted = text(card.getFirstPropertyValue('fn'));
	if (formatted) return formatted;
	const structured = card.getFirstPropertyValue('n');
	if (Array.isArray(structured)) {
		const [family, given, additional, prefix, suffix] = structured.map((part) => text(part));
		return [prefix, given, additional, family, suffix].filter(Boolean).join(' ');
	}
	return '';
}

function parseVcards(source: string, addressBookId: string): ParsedContactImport {
	let parsed: unknown;
	try {
		parsed = ICAL.parse(source);
	} catch {
		throw new Error('The selected file is not valid vCard data.');
	}
	if (!Array.isArray(parsed)) throw new Error('The selected file is not valid vCard data.');

	const rawCards = typeof parsed[0] === 'string' ? [parsed] : parsed;
	const components: ICAL.Component[] = [];
	try {
		for (const raw of rawCards) {
			const component = new ICAL.Component(raw as never);
			if (component.name === 'vcard') components.push(component);
		}
	} catch {
		throw new Error('The selected file is not valid vCard data.');
	}
	if (components.length === 0) throw new Error('The selected file is not valid vCard data.');
	if (components.some((card) => !['3.0', '4.0'].includes(text(card.getFirstPropertyValue('version'))))) {
		throw new Error('Only vCard 3.0 or 4.0 files are supported.');
	}

	const contacts = components.map((card, index): ContactImportCandidate => {
		const emails = card.getAllProperties('email').map((property) => ({
			address: text(property.getFirstValue()),
			type: importEntryType(property.getParameter('type')),
			preference: importPreference(property)
		}));
		const phones = card.getAllProperties('tel').map((property) => ({
			number: text(property.getFirstValue()),
			type: importEntryType(property.getParameter('type')),
			preference: importPreference(property)
		}));
		const organizations = card.getAllProperties('org')
			.map((property) => text(property.getFirstValue()))
			.filter(Boolean);
		const notes = card.getAllProperties('note')
			.map((property) => text(property.getFirstValue()))
			.filter(Boolean);
		const sourceUid = text(card.getFirstPropertyValue('uid'));
		return {
			sourceIndex: index + 1,
			...(sourceUid && { sourceUid }),
			form: {
				name: cardDisplayName(card),
				emails: normalizeEmails(emails),
				phones: normalizePhones(phones),
				organization: organizations[0] ?? '',
				notes: notes.join('\n'),
				favorite: false,
				addressBookIds: [addressBookId]
			}
		};
	});
	return { format: 'vcard', contacts, warnings: [] };
}

function csvValue(row: Record<string, string>, key: string): string {
	return typeof row[key] === 'string' ? row[key].trim() : '';
}

function splitGoogleValues(value: string): string[] {
	return value.split(/\s*:::\s*/).map((entry) => entry.trim()).filter(Boolean);
}

function parseGoogleCsv(source: string, addressBookId: string): ParsedContactImport {
	const result = Papa.parse<Record<string, string>>(source, {
		header: true,
		skipEmptyLines: 'greedy',
		transformHeader: (header) => header.replace(/^\uFEFF/, '').trim()
	});
	const headers = result.meta.fields ?? [];
	const hasIdentityHeader = headers.some((header) =>
		header === 'Name' || header === 'Given Name' || header === 'Family Name'
	);
	const hasContactHeader = headers.some((header) =>
		/^(?:E-mail|Phone) \d+ - Value$/.test(header)
		|| header === 'Organization 1 - Name'
		|| header === 'Notes'
	);
	if (!hasIdentityHeader || !hasContactHeader) {
		throw new Error('The selected CSV is not a Google Contacts export.');
	}
	if (result.errors.some((error) => error.type === 'Quotes' || error.type === 'Delimiter')) {
		throw new Error('The selected Google Contacts CSV is malformed.');
	}
	const rowErrors = new Map<number, string>();
	for (const error of result.errors) {
		if (typeof error.row === 'number') rowErrors.set(error.row, 'Malformed CSV row.');
	}

	const contacts = result.data.map((row, index): ContactImportCandidate => {
		const explicitName = csvValue(row, 'Name');
		const given = csvValue(row, 'Given Name');
		const family = csvValue(row, 'Family Name');
		const emails: Array<{ address: string; type: ContactEntryType }> = [];
		const phones: Array<{ number: string; type: ContactEntryType }> = [];
		for (let entry = 1; entry <= 20; entry += 1) {
			const emailType = importEntryType(csvValue(row, `E-mail ${entry} - Type`));
			for (const address of splitGoogleValues(csvValue(row, `E-mail ${entry} - Value`))) {
				emails.push({ address, type: emailType });
			}
			const phoneType = importEntryType(csvValue(row, `Phone ${entry} - Type`));
			for (const number of splitGoogleValues(csvValue(row, `Phone ${entry} - Value`))) {
				phones.push({ number, type: phoneType });
			}
		}
		return {
			sourceIndex: index + 2,
			...(rowErrors.has(index) && { parseError: rowErrors.get(index) }),
			form: {
				name: explicitName || [given, family].filter(Boolean).join(' '),
				emails: normalizeEmails(emails),
				phones: normalizePhones(phones),
				organization: csvValue(row, 'Organization 1 - Name'),
				notes: csvValue(row, 'Notes'),
				favorite: false,
				addressBookIds: [addressBookId]
			}
		};
	});
	return {
		format: 'google-csv',
		contacts,
		warnings: result.errors.map((error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`)
	};
}

export function parseContactImport(
	fileName: string,
	source: string,
	addressBookId: string
): ParsedContactImport {
	if (!addressBookId) throw new Error('Choose an address book before importing.');
	const name = fileName.toLowerCase();
	if (name.endsWith('.vcf') || name.endsWith('.vcard')) return parseVcards(source, addressBookId);
	if (name.endsWith('.csv')) return parseGoogleCsv(source, addressBookId);
	throw new Error('Choose an Apple or Google vCard (.vcf) or Google Contacts CSV file.');
}

function invalidImportReason(form: ContactFormValue): string | null {
	if (form.name.length > 255 || form.organization.length > 255 || form.notes.length > 10_000) {
		return 'A text field exceeds the supported length.';
	}
	if (form.emails.length > 20 || form.phones.length > 20) {
		return 'The contact has too many email addresses or phone numbers.';
	}
	if (form.emails.some((email) => !/^[^\s@]+@[^\s@]+$/.test(email.address))) {
		return 'Invalid email address.';
	}
	if (!form.name && form.emails.length === 0 && form.phones.length === 0 && !form.organization) {
		return 'The row has no name, email address, phone number, or organization.';
	}
	if (form.addressBookIds.length === 0) return 'No address book is selected.';
	return null;
}

export function classifyContactImport(
	candidates: ContactImportCandidate[],
	existingContacts: ContactCard[]
): ClassifiedContactImport[] {
	const existingEmails = new Set(
		existingContacts.flatMap((contact) =>
			Object.values(contact.emails ?? {}).map((email) => email.address.trim().toLowerCase())
		)
	);
	const earlierEmails = new Set<string>();
	return candidates.map((candidate) => {
		const emails = candidate.form.emails.map((email) => email.address.trim().toLowerCase()).filter(Boolean);
		const invalidReason = candidate.parseError ?? invalidImportReason(candidate.form);
		if (invalidReason) {
			return { ...candidate, status: 'invalid', reason: invalidReason };
		}
		let result: ClassifiedContactImport;
		if (emails.some((email) => earlierEmails.has(email))) {
			result = { ...candidate, status: 'duplicate', reason: 'Matches an earlier row in this file.' };
		} else if (emails.some((email) => existingEmails.has(email))) {
			result = { ...candidate, status: 'duplicate', reason: 'Matches an existing contact email.' };
		} else {
			result = { ...candidate, status: 'ready' };
		}
		for (const email of emails) earlierEmails.add(email);
		return result;
	});
}
