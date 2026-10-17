import { describe, expect, it } from 'vitest';
import {
	categoryCondition,
	categoryKeywordPatch,
	categoryOf,
	inboxTabHref,
	isInboxCategory,
	parseInboxCategory
} from './categories';

describe('parseInboxCategory', () => {
	it('accepts the four tabs and defaults to Important', () => {
		expect(parseInboxCategory('promotions')).toBe('promotions');
		expect(parseInboxCategory(null)).toBe('important');
		expect(parseInboxCategory('')).toBe('important');
		expect(parseInboxCategory('social')).toBe('important');
	});

	it('only treats known keys as categories', () => {
		expect(isInboxCategory('updates')).toBe(true);
		expect(isInboxCategory('Updates')).toBe(false);
		expect(isInboxCategory(undefined)).toBe(false);
	});
});

describe('categoryCondition', () => {
	it('selects a sorted tab by its keyword', () => {
		expect(categoryCondition('newsletters')).toEqual({ hasKeyword: '$cat_newsletters' });
	});

	it('defines Important as having none of the other keywords', () => {
		// Unsorted mail must land here — this is what keeps a failed or
		// missing classification from hiding a message.
		expect(categoryCondition('important')).toEqual({
			operator: 'NOT',
			conditions: [
				{ hasKeyword: '$cat_updates' },
				{ hasKeyword: '$cat_newsletters' },
				{ hasKeyword: '$cat_promotions' }
			]
		});
	});
});

describe('categoryKeywordPatch', () => {
	it('turns on one category and clears the rest', () => {
		expect(categoryKeywordPatch('updates')).toEqual({
			$cat_updates: true,
			$cat_newsletters: false,
			$cat_promotions: false
		});
	});

	it('clears every category for Important', () => {
		expect(categoryKeywordPatch('important')).toEqual({
			$cat_updates: false,
			$cat_newsletters: false,
			$cat_promotions: false
		});
	});
});

describe('categoryOf', () => {
	it('reads the tab from the keywords', () => {
		expect(categoryOf({ $seen: true, $cat_promotions: true })).toBe('promotions');
		expect(categoryOf({ $seen: true })).toBe('important');
		expect(categoryOf({})).toBe('important');
	});
});

describe('inboxTabHref', () => {
	const base = new URL('https://mail.example/inbox?category=updates&filter=unread&page=3');

	it('keeps the quick filter and starts the tab on its first page', () => {
		expect(inboxTabHref(base, 'promotions')).toBe('/inbox?category=promotions&filter=unread');
	});

	it('leaves the default tab out of the URL', () => {
		expect(inboxTabHref(base, 'important')).toBe('/inbox?filter=unread');
		expect(inboxTabHref(new URL('https://mail.example/inbox'), 'important')).toBe('/inbox');
	});
});
