export type RuleConditionField = 'from' | 'to' | 'subject' | 'body' | 'size' | 'hasAttachment';
export type RuleConditionOp = 'contains' | 'not_contains' | 'is' | 'starts_with' | 'ends_with';
export type RuleLogic = 'allof' | 'anyof';

export interface RuleCondition {
	id: string;
	field: RuleConditionField;
	op: RuleConditionOp;
	value: string;
	negate: boolean;
}

export type RuleActionType =
	| 'moveToFolder'
	| 'applyLabel'
	| 'markRead'
	| 'markImportant'
	| 'delete'
	| 'stopProcessing';

export interface RuleAction {
	type: RuleActionType;
	value?: string;
}

export interface Rule {
	id: string;
	name: string;
	enabled: boolean;
	logic: RuleLogic;
	conditions: RuleCondition[];
	actions: RuleAction[];
	createdAt: number;
}
