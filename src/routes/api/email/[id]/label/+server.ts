import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { applyLabel, removeLabel } from '$lib/jmap/labels';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const { labelId, action } = (await request.json()) as {
		labelId: string;
		action: 'apply' | 'remove';
	};

	if (!labelId || (action !== 'apply' && action !== 'remove')) {
		return json({ error: 'labelId and valid action required' }, { status: 400 });
	}

	const client = createClient(locals.auth);

	// `labelId` is now a JMAP Mailbox id. Applying/removing a label is a
	// multi-mailbox membership patch on the email, not a keyword patch.
	if (action === 'apply') {
		await applyLabel(client, locals.auth.accountId, params.id, labelId);
	} else {
		await removeLabel(client, locals.auth.accountId, params.id, labelId);
	}

	return json({ success: true });
};
