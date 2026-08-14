import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Hard ceiling per attachment. Mirrors the composer-side guard. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Proxy a file upload to the JMAP blob-upload endpoint so the user's auth
 * header never reaches the browser. Mirrors the download proxy: the upload
 * URL is `{apiUrl}upload/{accountId}/`. Returns the blobId the composer
 * later references when creating the email.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'No file provided' }, { status: 400 });
	}
	if (file.size > MAX_BYTES) {
		return json({ error: 'File exceeds 25MB limit' }, { status: 413 });
	}

	const uploadUrl = `${locals.auth.apiUrl}upload/${locals.auth.accountId}/`;
	const type = file.type || 'application/octet-stream';

	const res = await fetch(uploadUrl, {
		method: 'POST',
		headers: {
			Authorization: locals.auth.authHeader,
			'Content-Type': type
		},
		// Buffer the body so we don't depend on streaming/duplex semantics.
		// Capped at 25MB above, so memory cost is bounded.
		body: await file.arrayBuffer()
	});

	if (!res.ok) {
		return json({ error: `Upload failed (${res.status})` }, { status: 502 });
	}

	const blob = (await res.json()) as { blobId: string; type?: string; size?: number };
	return json({
		blobId: blob.blobId,
		name: file.name,
		type: blob.type ?? type,
		size: blob.size ?? file.size
	});
};
