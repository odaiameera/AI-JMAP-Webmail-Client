import { describe, expect, it } from 'vitest';
import { mockCategory, mockJev, mockStatementProbability } from './mock';
import { CATEGORY_QUESTION } from './categorize';
import { decideCategory } from './categorize';
import type { JevEmailState, JevFacts } from './email-state';

const noFacts: JevFacts = {
	sender_in_contacts: false,
	you_have_written_to_sender: false,
	you_have_written_in_this_thread: false,
	addressed_to_you_directly: true,
	has_list_unsubscribe: false,
	list_id: null,
	bulk_precedence: false,
	auto_submitted: false,
	sender_looks_automated: false,
	contains_sign_in_code: false
};

function state(subject: string, facts: Partial<JevFacts> = {}): JevEmailState {
	return {
		email: { from: 'x@example.com', to: [], cc: [], subject, body_excerpt: '' },
		facts: { ...noFacts, ...facts }
	};
}

describe('mockCategory', () => {
	it('follows the rule of thumb', () => {
		expect(mockCategory(state('Lunch?'))).toBe('important');
		expect(mockCategory(state('Your code', { contains_sign_in_code: true }))).toBe('updates');
		expect(mockCategory(state('Shipped', { sender_looks_automated: true }))).toBe('updates');
		expect(mockCategory(state('Issue 212', { has_list_unsubscribe: true }))).toBe('newsletters');
		expect(mockCategory(state('48 hours: 30% off', { has_list_unsubscribe: true }))).toBe('promotions');
		// People you know win over list headers.
		expect(mockCategory(state('Sale!', { has_list_unsubscribe: true, sender_in_contacts: true }))).toBe(
			'important'
		);
	});
});

describe('mockJev', () => {
	it('answers in TypeSafe’s shape, confidently enough to apply, and says it is a mock', () => {
		const res = mockJev(state('Issue 212', { list_id: 'weekly.example' }), { category: CATEGORY_QUESTION });
		expect(res.mock).toBe(true);
		expect(res.usage.inputTokens).toBeGreaterThan(300);
		expect(decideCategory(res.answers.category)).toMatchObject({ category: 'newsletters', apply: 'newsletters' });
	});
});

describe('mockStatementProbability', () => {
	it('calls a statement likely when its words appear in the email', () => {
		const s = { ...state('Your October invoice'), email: { ...state('Your October invoice').email, body_excerpt: 'Amount due: £40' } };
		expect(mockStatementProbability('it is an invoice or a payment request', s)).toBe(0.9);
		expect(mockStatementProbability('someone wants to meet next week', s)).toBe(0.1);
	});
});
