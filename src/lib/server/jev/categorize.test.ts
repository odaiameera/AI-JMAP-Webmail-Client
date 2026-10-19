import { describe, expect, it } from 'vitest';
import { CATEGORY_MIN_CONFIDENCE, CATEGORY_QUESTION, decideCategory } from './categorize';
import { INBOX_CATEGORIES } from '$lib/types/categories';

const choice = (pick: string, confidence: number) => ({
	type: 'choice' as const,
	choice: pick,
	probabilities: { important: 0.1, updates: 0.7, newsletters: 0.1, promotions: 0.1 },
	confidence
});

describe('the category question', () => {
	it('offers exactly the four tabs as options', () => {
		if (CATEGORY_QUESTION.type !== 'choice') throw new Error('expected a choice question');
		expect(Object.keys(CATEGORY_QUESTION.criteria)).toEqual(INBOX_CATEGORIES.map((c) => c.key));
	});
});

describe('decideCategory', () => {
	it('applies a confident pick', () => {
		expect(decideCategory(choice('updates', 0.6))).toMatchObject({
			category: 'updates',
			confidence: 0.6,
			apply: 'updates'
		});
	});

	it('keeps an unsure pick but leaves the email alone', () => {
		const decision = decideCategory(choice('promotions', CATEGORY_MIN_CONFIDENCE - 0.01));
		expect(decision?.category).toBe('promotions');
		expect(decision?.apply).toBeNull();
	});

	it('ignores answers it cannot use', () => {
		expect(decideCategory(undefined)).toBeNull();
		expect(decideCategory(choice('social', 0.9))).toBeNull();
		expect(decideCategory({ type: 'noul', noul: 0.9 })).toBeNull();
	});
});
