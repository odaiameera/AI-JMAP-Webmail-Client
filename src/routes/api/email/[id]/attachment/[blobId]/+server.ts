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
	const forceDownload = url.searchParams.get('download') === '1';
	const downloadUrl =
		`${locals.auth.apiUrl}download/${locals.auth.accountId}/${params.blobId}/${encodeURIComponent(filename)}`;

	const res = await fetch(downloadUrl, {
		headers: { Authorization: locals.auth.authHeader }
	});

	if (!res.ok) {
		return new Response('Download failed', { status: res.status });
	}

	// Default to `inline` so the built-in viewer can render PDFs in an
	// iframe and the browser doesn't trigger a download for `<img>`/fetch
	// previews. The download chip in the viewer uses `link.download` plus
	// `?download=1` to explicitly request attachment disposition.
	const safeName = filename.replace(/"/g, '');
	const disposition = forceDownload ? 'attachment' : 'inline';
	return new Response(res.body, {
		status: 200,
		headers: {
			'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
			'Content-Disposition': `${disposition}; filename="${safeName}"`,
			'Content-Length': res.headers.get('Content-Length') ?? ''
		}
	});
};
