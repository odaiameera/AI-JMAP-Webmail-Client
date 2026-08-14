import { env } from '$env/dynamic/private';
import type { TaskProposal } from './mail-agent';

export const TASK_PROVIDERS = ['todoist', 'linear', 'notion', 'webhook'] as const;
export type TaskProvider = (typeof TASK_PROVIDERS)[number];

export class TaskAdapterError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
		this.name = 'TaskAdapterError';
	}
}

export function taskAdapterProviders(): TaskProvider[] {
	const providers: TaskProvider[] = [];
	if (env.TODOIST_API_TOKEN) providers.push('todoist');
	if (env.LINEAR_API_KEY && env.LINEAR_TEAM_ID) providers.push('linear');
	if (env.NOTION_API_TOKEN && env.NOTION_DATA_SOURCE_ID) providers.push('notion');
	if (env.TASK_ADAPTER_URL) providers.push('webhook');
	return providers;
}

export function taskAdapterConfigured(): boolean {
	return taskAdapterProviders().length > 0;
}

async function providerFetch(
	provider: string,
	url: string | URL,
	init: RequestInit,
	timeoutMs = 15_000
): Promise<Response> {
	try {
		const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) {
			throw new TaskAdapterError(`${provider} returned an error (${response.status})`, 502);
		}
		return response;
	} catch (error) {
		if (error instanceof TaskAdapterError) throw error;
		const timedOut = error instanceof Error && error.name === 'TimeoutError';
		throw new TaskAdapterError(
			timedOut ? `${provider} timed out` : `Could not reach ${provider}`,
			502
		);
	}
}

async function createTodoistTask(task: TaskProposal): Promise<{ id?: string; url?: string }> {
	if (!env.TODOIST_API_TOKEN) throw new TaskAdapterError('Todoist is not configured', 501);
	const dueField = task.dueDate
		? task.dueDate.includes('T')
			? { due_datetime: task.dueDate }
			: { due_date: task.dueDate }
		: {};
	const response = await providerFetch('Todoist', 'https://api.todoist.com/api/v1/tasks', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.TODOIST_API_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			content: task.title,
			description: task.description || undefined,
			project_id: env.TODOIST_PROJECT_ID || undefined,
			...dueField
		})
	});
	const data = (await response.json().catch(() => null)) as { id?: unknown } | null;
	const id = typeof data?.id === 'string' ? data.id : undefined;
	if (!id) throw new TaskAdapterError('Todoist did not return a task ID', 502);
	return { id, url: `https://app.todoist.com/app/task/${encodeURIComponent(id)}` };
}

async function createLinearIssue(task: TaskProposal): Promise<{ id?: string; url?: string }> {
	if (!env.LINEAR_API_KEY || !env.LINEAR_TEAM_ID) {
		throw new TaskAdapterError('Linear is not configured', 501);
	}
	const response = await providerFetch('Linear', 'https://api.linear.app/graphql', {
		method: 'POST',
		headers: {
			Authorization: env.LINEAR_API_KEY,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `mutation CreateMailAgentIssue($input: IssueCreateInput!) {
				issueCreate(input: $input) {
					success
					issue { id identifier url }
				}
			}`,
			variables: {
				input: {
					teamId: env.LINEAR_TEAM_ID,
					title: task.title,
					description: task.description || undefined,
					projectId: env.LINEAR_PROJECT_ID || undefined,
					dueDate: task.dueDate?.slice(0, 10) || undefined
				}
			}
		})
	});
	const data = (await response.json().catch(() => null)) as {
		data?: {
			issueCreate?: {
				success?: boolean;
				issue?: { id?: string; identifier?: string; url?: string } | null;
			};
		};
		errors?: unknown[];
	} | null;
	const issue = data?.data?.issueCreate?.issue;
	if (data?.errors?.length || !data?.data?.issueCreate?.success || !issue?.id) {
		throw new TaskAdapterError('Linear rejected the issue', 502);
	}
	return { id: issue.identifier || issue.id, url: issue.url };
}

function notionHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${env.NOTION_API_TOKEN}`,
		'Content-Type': 'application/json',
		'Notion-Version': '2026-03-11'
	};
}

async function createNotionPage(task: TaskProposal): Promise<{ id?: string; url?: string }> {
	if (!env.NOTION_API_TOKEN || !env.NOTION_DATA_SOURCE_ID) {
		throw new TaskAdapterError('Notion is not configured', 501);
	}
	const schemaResponse = await providerFetch(
		'Notion',
		`https://api.notion.com/v1/data_sources/${encodeURIComponent(env.NOTION_DATA_SOURCE_ID)}`,
		{ headers: notionHeaders() }
	);
	const schema = (await schemaResponse.json().catch(() => null)) as {
		properties?: Record<string, { type?: string }>;
	} | null;
	const entries = Object.entries(schema?.properties ?? {});
	const titleProperty = entries.find(([, value]) => value.type === 'title')?.[0];
	if (!titleProperty) throw new TaskAdapterError('The Notion data source has no title property', 502);

	const requestedDue = env.NOTION_DUE_PROPERTY;
	const dueProperty = requestedDue
		? entries.find(([name, value]) => name === requestedDue && value.type === 'date')?.[0]
		: entries.find(
				([name, value]) =>
					value.type === 'date' && /^(due|due date|deadline)$/i.test(name.trim())
			)?.[0];
	const properties: Record<string, unknown> = {
		[titleProperty]: {
			type: 'title',
			title: [{ type: 'text', text: { content: task.title } }]
		}
	};
	if (task.dueDate && dueProperty) {
		properties[dueProperty] = { type: 'date', date: { start: task.dueDate } };
	}
	const markdown = [
		task.description,
		task.dueDate && !dueProperty ? `**Due:** ${task.dueDate}` : ''
	]
		.filter(Boolean)
		.join('\n\n');
	const response = await providerFetch('Notion', 'https://api.notion.com/v1/pages', {
		method: 'POST',
		headers: notionHeaders(),
		body: JSON.stringify({
			parent: { type: 'data_source_id', data_source_id: env.NOTION_DATA_SOURCE_ID },
			properties,
			...(markdown ? { markdown } : {})
		})
	});
	const data = (await response.json().catch(() => null)) as {
		id?: unknown;
		url?: unknown;
	} | null;
	const id = typeof data?.id === 'string' ? data.id : undefined;
	if (!id) throw new TaskAdapterError('Notion did not return a page ID', 502);
	return { id, url: typeof data?.url === 'string' ? data.url : undefined };
}

async function createWebhookTask(task: TaskProposal): Promise<{ id?: string; url?: string }> {
	if (!env.TASK_ADAPTER_URL) throw new TaskAdapterError('The webhook is not configured', 501);
	let endpoint: URL;
	try {
		endpoint = new URL(env.TASK_ADAPTER_URL);
	} catch {
		throw new TaskAdapterError('The task adapter URL is invalid', 500);
	}
	if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
		throw new TaskAdapterError('The task adapter URL must use HTTP or HTTPS', 500);
	}
	const response = await providerFetch('Task adapter', endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(env.TASK_ADAPTER_API_KEY
				? { Authorization: `Bearer ${env.TASK_ADAPTER_API_KEY}` }
				: {})
		},
		body: JSON.stringify({ source: 'ai-jmap-webmail-client', task })
	});
	const data = (await response.json().catch(() => null)) as {
		id?: unknown;
		url?: unknown;
	} | null;
	return {
		id: typeof data?.id === 'string' ? data.id.slice(0, 300) : undefined,
		url: typeof data?.url === 'string' ? data.url.slice(0, 1000) : undefined
	};
}

export async function createTaskWithAdapter(
	task: TaskProposal,
	provider?: TaskProvider
): Promise<{ provider: TaskProvider; id?: string; url?: string }> {
	const configured = taskAdapterProviders();
	const selected = provider ?? configured[0];
	if (!selected || !configured.includes(selected)) {
		throw new TaskAdapterError(
			selected ? `${selected} is not configured` : 'No task adapter is configured',
			501
		);
	}

	let result: { id?: string; url?: string };
	if (selected === 'todoist') result = await createTodoistTask(task);
	else if (selected === 'linear') result = await createLinearIssue(task);
	else if (selected === 'notion') result = await createNotionPage(task);
	else result = await createWebhookTask(task);
	return { provider: selected, ...result };
}
