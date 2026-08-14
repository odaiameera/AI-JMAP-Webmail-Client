/**
 * Build the proxied attachment URL. Defaults to `download` mode so direct
 * hits or bookmarks don't accidentally render a hostile attachment in the
 * browser. The built-in viewer opts into inline rendering explicitly.
 */
export function attachmentUrl(
	emailId: string,
	blobId: string,
	name: string,
	mode: 'inline' | 'download' = 'download'
): string {
	const base = `/api/email/${emailId}/attachment/${blobId}?name=${encodeURIComponent(name)}`;
	return mode === 'inline' ? `${base}&disposition=inline` : base;
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
