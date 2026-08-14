import { afterEach, describe, expect, it, vi } from 'vitest';

const { testEnv } = vi.hoisted(() => ({
	testEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: testEnv }));

import { createTaskWithAdapter, TaskAdapterError } from './task-adapter';

const task = {
	title: 'Reply to Sam',
	description: 'Send the figures.',
	dueDate: '2026-08-18',
	destination: null
} as const;

afterEach(() => {
	vi.unstubAllGlobals();
	for (const key of Object.keys(testEnv)) delete testEnv[key];
});

describe('task adapters', () => {
	it('creates a Todoist API v1 task', async () => {
		testEnv.TODOIST_API_TOKEN = 'todoist-token';
		testEnv.TODOIST_PROJECT_ID = 'project-1';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'todo-1' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(createTaskWithAdapter(task, 'todoist')).resolves.toEqual({
			provider: 'todoist',
			id: 'todo-1',
			url: 'https://app.todoist.com/app/task/todo-1'
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.todoist.com/api/v1/tasks');
		expect(init.headers).toMatchObject({ Authorization: 'Bearer todoist-token' });
		expect(JSON.parse(String(init.body))).toMatchObject({
			content: 'Reply to Sam',
			project_id: 'project-1',
			due_date: '2026-08-18'
		});
	});

	it('creates a Linear issue and checks GraphQL success', async () => {
		testEnv.LINEAR_API_KEY = 'linear-key';
		testEnv.LINEAR_TEAM_ID = 'team-1';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						issueCreate: {
							success: true,
							issue: { id: 'uuid-1', identifier: 'MAIL-1', url: 'https://linear.app/x/MAIL-1' }
						}
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(createTaskWithAdapter(task, 'linear')).resolves.toEqual({
			provider: 'linear',
			id: 'MAIL-1',
			url: 'https://linear.app/x/MAIL-1'
		});
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toMatchObject({ Authorization: 'linear-key' });
		expect(JSON.parse(String(init.body)).variables.input).toMatchObject({
			teamId: 'team-1',
			dueDate: '2026-08-18'
		});
	});

	it('discovers the Notion data-source schema before creating a page', async () => {
		testEnv.NOTION_API_TOKEN = 'notion-token';
		testEnv.NOTION_DATA_SOURCE_ID = 'source-1';
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ properties: { Task: { type: 'title' }, Due: { type: 'date' } } }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'page-1', url: 'https://notion.so/page-1' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(createTaskWithAdapter(task, 'notion')).resolves.toEqual({
			provider: 'notion',
			id: 'page-1',
			url: 'https://notion.so/page-1'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		const createBody = JSON.parse(String(createInit.body));
		expect(createBody.parent).toEqual({ type: 'data_source_id', data_source_id: 'source-1' });
		expect(createBody.properties.Task.title[0].text.content).toBe('Reply to Sam');
		expect(createBody.properties.Due.date.start).toBe('2026-08-18');
	});

	it('keeps the generic webhook adapter available', async () => {
		testEnv.TASK_ADAPTER_URL = 'https://tasks.example.test/create';
		testEnv.TASK_ADAPTER_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'task-1' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(createTaskWithAdapter(task, 'webhook')).resolves.toEqual({
			provider: 'webhook',
			id: 'task-1',
			url: undefined
		});
		const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
	});

	it('does not create anything without a configured adapter', async () => {
		await expect(createTaskWithAdapter(task)).rejects.toMatchObject({
			status: 501
		} satisfies Partial<TaskAdapterError>);
	});
});
