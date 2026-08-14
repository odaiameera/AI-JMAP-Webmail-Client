import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import {
	runMailAgent,
	type MailAgentAction
} from '$lib/server/ai/mail-agent';
import { MailAssistantError, type AIChatMessage } from '$lib/server/ai/mail-assistant';
import { taskAdapterProviders } from '$lib/server/ai/task-adapter';

const ACTIONS = new Set<MailAgentAction>([
	'chat',
	'summarize_today',
	'calendar_tomorrow',
	'summarize_current',
	'propose_task'
]);
const DAY_MS = 86_400_000;

function safeTimeZone(value: unknown): string {
	if (typeof value !== 'string' || value.length > 100) return 'UTC';
	try {
		new Intl.DateTimeFormat('en', { timeZone: value }).format();
		return value;
	} catch {
		return 'UTC';
	}
}

function range(startValue: unknown, endValue: unknown, fallbackOffset: number): [number, number] {
	const start = Date.parse(typeof startValue === 'string' ? startValue : '');
	const end = Date.parse(typeof endValue === 'string' ? endValue : '');
	if (Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= DAY_MS * 2) {
		return [start, end];
	}
	const fallbackStart = new Date();
	fallbackStart.setUTCHours(0, 0, 0, 0);
	fallbackStart.setUTCDate(fallbackStart.getUTCDate() + fallbackOffset);
	return [fallbackStart.getTime(), fallbackStart.getTime() + DAY_MS];
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const action = body?.action;
	const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1500) : '';
	if (typeof action !== 'string' || !ACTIONS.has(action as MailAgentAction) || !message) {
		return json({ error: 'A valid action and message are required' }, { status: 400 });
	}

	const rawConversation = Array.isArray(body?.conversation) ? body.conversation : [];
	const conversation: AIChatMessage[] = rawConversation
		.filter(
			(item): item is { role: 'user' | 'assistant'; content: string } =>
				!!item &&
				typeof item === 'object' &&
				((item as { role?: unknown }).role === 'user' ||
					(item as { role?: unknown }).role === 'assistant') &&
				typeof (item as { content?: unknown }).content === 'string'
		)
		.slice(-12)
		.map((item) => ({ role: item.role, content: item.content.slice(0, 1500) }));
	const [todayStartMs, todayEndMs] = range(body?.todayStart, body?.todayEnd, 0);
	const [tomorrowStartMs, tomorrowEndMs] = range(
		body?.tomorrowStart,
		body?.tomorrowEnd,
		1
	);

	try {
		const result = await runMailAgent(locals.auth, userEmailFromAuth(locals.auth), {
			action: action as MailAgentAction,
			message,
			conversation,
			currentEmailId:
				typeof body?.currentEmailId === 'string' && body.currentEmailId.length <= 300
					? body.currentEmailId
					: null,
			timeZone: safeTimeZone(body?.timeZone),
			todayStartMs,
			todayEndMs,
			tomorrowStartMs,
			tomorrowEndMs
		});
		return json({ ...result, taskProviders: taskAdapterProviders() });
	} catch (error) {
		if (error instanceof MailAssistantError) {
			return json({ error: error.message }, { status: error.status });
		}
		console.error('[ai-agent] request failed', error);
		return json({ error: 'The mail agent could not load your account context' }, { status: 502 });
	}
};
