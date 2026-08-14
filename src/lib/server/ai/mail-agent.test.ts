import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/jmap/auth', () => ({ createClient: vi.fn() }));
vi.mock('$lib/jmap/email', () => ({ getEmailDetail: vi.fn() }));
vi.mock('$lib/jmap/mailbox', () => ({ getMailboxes: vi.fn() }));
vi.mock('$lib/server/calendar/service', () => ({ getEventsInRange: vi.fn() }));

import { inferMailAgentAction } from './mail-agent';

describe('inferMailAgentAction', () => {
	it('routes natural mailbox and calendar requests to real context tools', () => {
		expect(inferMailAgentAction('chat', "What's important in today's email?", false)).toBe(
			'summarize_today'
		);
		expect(inferMailAgentAction('chat', 'What meetings do I have tomorrow?', false)).toBe(
			'calendar_tomorrow'
		);
	});

	it('turns task language into a proposal, never direct creation', () => {
		expect(inferMailAgentAction('chat', 'Turn this into a task for Friday', true)).toBe(
			'propose_task'
		);
	});

	it('uses the current email only when one is actually open', () => {
		expect(inferMailAgentAction('chat', 'Summarize this email', true)).toBe(
			'summarize_current'
		);
		expect(inferMailAgentAction('chat', 'Summarize this email', false)).toBe('chat');
	});
});
