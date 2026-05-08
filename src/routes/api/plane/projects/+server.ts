import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listProjects, PlaneError } from '$lib/server/plane';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const projects = await listProjects();
		return json({ projects });
	} catch (err) {
		const status = err instanceof PlaneError ? err.status : 500;
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to list Plane projects' },
			{ status }
		);
	}
};
