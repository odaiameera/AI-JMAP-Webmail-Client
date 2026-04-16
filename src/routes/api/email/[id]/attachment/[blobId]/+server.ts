import type { RequestHandler } from './$types';

/**
 * Proxy a JMAP blob download so the user's auth header never reaches
 * the browser. The blob URL template is:
 *   {apiUrl}download/{accountId}/{blobId}/{filename}
 * where `apiUrl` is the `https://…/jmap/` base from the session
 * discovery response (we stored it on `locals.auth.apiUrl`).
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.auth) {
		return new Response('Unauthorized', { status: 401 });
	}

	const filename = url.searchParams.get('name') ?? 'attachment';
	const downloadUrl =
		`${locals.auth.apiUrl}download/${locals.auth.accountId}/${params.blobId}/${encodeURIComponent(filename)}`;

	const res = await fetch(downloadUrl, {
		headers: { Authorization: locals.auth.authHeader }
	});

	if (!res.ok) {
		return new Response('Download failed', { status: res.status });
	}

	// Stream the blob through with the sender's content-type and a
	// Content-Disposition that browsers treat as a download. The filename
	// is sanitised (quotes stripped) to keep the header well-formed.
	const safeName = filename.replace(/"/g, '');
	return new Response(res.body, {
		status: 200,
		headers: {
			'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
			'Content-Disposition': `attachment; filename="${safeName}"`,
			'Content-Length': res.headers.get('Content-Length') ?? ''
		}
	});
};
