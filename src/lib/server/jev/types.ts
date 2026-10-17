/**
 * The TypeSafe System One wire format, as used here. Jev answers typed
 * questions about a `state` (one email) with probabilities rather than text.
 * See https://docs.typesafe.ai/api.
 */

export type JevQuestion =
	| {
			type: 'choice';
			instructions: string;
			/** Option name → what it means. The names come back as answers. */
			criteria: Record<string, string | null>;
	  }
	| {
			type: 'noul';
			instructions: string;
			criteria?: { true?: string; false?: string };
	  }
	| {
			type: 'score';
			instructions: string;
			/** Ordered levels, 2–10 of them. */
			criteria: string[];
	  };

export interface ChoiceAnswer {
	type: 'choice';
	/** The most probable option. */
	choice: string;
	/** One entry per option, summing to 1. */
	probabilities: Record<string, number>;
	/** 1 when all probability sits on one option, 0 when spread evenly. */
	confidence: number;
}

export interface NoulAnswer {
	type: 'noul';
	/** Probability the statement is true. */
	noul: number;
}

export interface ScoreAnswer {
	type: 'score';
	score: number;
	legend: Record<string, string>;
	probabilities: Record<string, number>;
	confidence: number;
}

export type JevAnswer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export interface JevResponse {
	/** The model that answered — the pinned version, or `mock`. */
	model: string;
	/** Keyed by the question ids sent. */
	answers: Record<string, JevAnswer>;
	usage: { inputTokens: number; outputTokens: number };
	/** True when the answers came from JEV_MOCK, not from TypeSafe. */
	mock: boolean;
}
