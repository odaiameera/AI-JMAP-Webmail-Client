import { describe, expect, it } from 'vitest';
import { queueSenderForContacts, takePendingContact } from './navigation';

describe('Add sender to Contacts navigation', () => {
	it('keeps sender PII in one-shot application memory instead of the URL', () => {
		const href = queueSenderForContacts({
			name: 'Lin & Chen',
			email: 'lin+alerts@example.test'
		});
		expect(href).toBe('/contacts');
		expect(href).not.toContain('Lin');
		expect(href).not.toContain('example.test');
		expect(takePendingContact()).toEqual({
			name: 'Lin & Chen',
			email: 'lin+alerts@example.test'
		});
		expect(takePendingContact()).toBeNull();
	});
});
