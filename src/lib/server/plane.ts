/**
 * Thin server-side wrapper around the Plane REST API. The token never
 * leaves the server — clients hit our proxy endpoints under
 * `/api/plane/*`, which call into here.
 */

import { env } from '$env/dynamic/private';

interface PlaneConfig {
	baseUrl: string;
	apiKey: string;
	workspaceSlug: string;
}

export interface PlaneProject {
	id: string;
	name: string;
	identifier: string;
}

export interface CreateIssueInput {
	projectId: string;
	name: string;
	description_html?: string;
	description_stripped?: string;
	priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
}

export interface CreatedIssue {
	id: string;
	sequence_id: number;
	project_id: string;
	url: string;
}

export class PlaneError extends Error {
	constructor(message: string, public status: number) {
		super(message);
	}
}

function getConfig(): PlaneConfig {
	const baseUrl = env.PLANE_BASE_URL;
	const apiKey = env.PLANE_API_KEY;
	const workspaceSlug = env.PLANE_WORKSPACE_SLUG;
	if (!baseUrl || !apiKey || !workspaceSlug) {
		throw new PlaneError(
			'Plane integration is not configured. Set PLANE_BASE_URL, PLANE_API_KEY, and PLANE_WORKSPACE_SLUG.',
			500
		);
	}
	return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, workspaceSlug };
}

async function planeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	const cfg = getConfig();
	const res = await fetch(`${cfg.baseUrl}${path}`, {
		...init,
		headers: {
			'X-API-Key': cfg.apiKey,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...(init.headers ?? {})
		}
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new PlaneError(
			`Plane API ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
			res.status
		);
	}
	return (await res.json()) as T;
}

export async function listProjects(): Promise<PlaneProject[]> {
	const cfg = getConfig();
	type Response = { results?: unknown[] } | unknown[];
	const data = await planeFetch<Response>(
		`/workspaces/${encodeURIComponent(cfg.workspaceSlug)}/projects/`
	);
	const rows = Array.isArray(data) ? data : (data.results ?? []);
	return rows.map((r) => {
		const row = r as { id: string; name: string; identifier: string };
		return { id: row.id, name: row.name, identifier: row.identifier };
	});
}

export async function createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
	const cfg = getConfig();
	const body: Record<string, unknown> = { name: input.name };
	if (input.description_html) body.description_html = input.description_html;
	if (input.description_stripped) body.description_stripped = input.description_stripped;
	if (input.priority) body.priority = input.priority;

	const created = await planeFetch<{ id: string; sequence_id: number; project_id?: string }>(
		`/workspaces/${encodeURIComponent(cfg.workspaceSlug)}/projects/${encodeURIComponent(input.projectId)}/issues/`,
		{ method: 'POST', body: JSON.stringify(body) }
	);

	const url = `${cfg.baseUrl.replace(/\/api\/v\d+$/, '')}/${cfg.workspaceSlug}/projects/${input.projectId}/issues/${created.id}`;
	return {
		id: created.id,
		sequence_id: created.sequence_id,
		project_id: created.project_id ?? input.projectId,
		url
	};
}
