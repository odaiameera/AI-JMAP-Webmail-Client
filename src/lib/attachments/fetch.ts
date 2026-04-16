/**
 * Build the proxied attachment URL. Defaults to inline disposition so the
 * resource can be embedded in `<img>`, `<iframe>`, etc. Pass `download: true`
 * to force the browser to save the file via Content-Disposition: attachment.
 */
export function attachmentUrl(
	emailId: string,
	blobId: string,
	name: string,
	opts: { download?: boolean } = {}
): string {
	const params = new URLSearchParams({ name });
	if (opts.download) params.set('download', '1');
	return `/api/email/${emailId}/attachment/${blobId}?${params.toString()}`;
}

export async function fetchBlob(emailId: string, blobId: string, name: string): Promise<Blob> {
	const res = await fetch(attachmentUrl(emailId, blobId, name));
	if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
	return res.blob();
}

export async function fetchArrayBuffer(emailId: string, blobId: string, name: string): Promise<ArrayBuffer> {
	const blob = await fetchBlob(emailId, blobId, name);
	return blob.arrayBuffer();
}

export async function fetchText(emailId: string, blobId: string, name: string): Promise<string> {
	const res = await fetch(attachmentUrl(emailId, blobId, name));
	if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
	return res.text();
}
