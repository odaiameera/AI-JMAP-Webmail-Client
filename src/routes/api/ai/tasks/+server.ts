import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createTaskWithAdapter,
	TaskAdapterError,
	TASK_PROVIDERS,
	type TaskProvider
} from '$lib/server/ai/task-adapter';
import type { TaskProposal } from '$lib/server/ai/mail-agent';

function taskFrom(value: unknown): TaskProposal | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '';
	const description =
		typeof raw.description === 'string' ? raw.description.trim().slice(0, 2000) : '';
	const dueDate = typeof raw.dueDate === 'string' ? raw.dueDate.trim().slice(0, 100) : null;
	const destination =
		raw.destination === 'todoist' || raw.destination === 'linear' || raw.destination === 'notion'
			? raw.destination
			: null;
	if (!title) return null;
	if (
		dueDate &&
		!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(dueDate)
	) {
		return null;
	}
	return { title, description, dueDate, destination };
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as {
		confirmed?: unknown;
		task?: unknown;
		provider?: unknown;
	} | null;
	if (body?.confirmed !== true) {
		return json({ error: 'Task creation requires explicit confirmation' }, { status: 400 });
	}
	const task = taskFrom(body.task);
	if (!task) return json({ error: 'A valid task is required' }, { status: 400 });
	const provider =
		typeof body.provider === 'string' &&
		(TASK_PROVIDERS as readonly string[]).includes(body.provider)
			? (body.provider as TaskProvider)
			: undefined;

	try {
		const result = await createTaskWithAdapter(task, provider);
		const label = result.provider === 'webhook'
			? 'task adapter'
			: result.provider[0].toUpperCase() + result.provider.slice(1);
		return json({ success: true, message: `Created “${task.title}” in ${label}.`, ...result });
	} catch (error) {
		if (error instanceof TaskAdapterError) {
			return json({ error: error.message }, { status: error.status });
		}
		return json({ error: 'The task could not be created' }, { status: 502 });
	}
};
