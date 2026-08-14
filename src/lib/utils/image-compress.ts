/**
 * Compress an image File to a data URL for inline embedding in email HTML.
 * Resizes to fit within `maxDim` on the longest side and re-encodes as WebP.
 * Falls back to HTMLCanvasElement on browsers without OffscreenCanvas.
 */
export async function compressImageForBody(
	file: File,
	maxDim = 1600,
	quality = 0.9
): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);

	const blob = await renderToWebp(bitmap, w, h, quality);
	bitmap.close();
	return blobToDataUrl(blob);
}

async function renderToWebp(
	source: ImageBitmap,
	w: number,
	h: number,
	quality: number
): Promise<Blob> {
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D context unavailable');
		ctx.drawImage(source, 0, 0, w, h);
		return canvas.convertToBlob({ type: 'image/webp', quality });
	}

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D context unavailable');
	ctx.drawImage(source, 0, 0, w, h);
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
			'image/webp',
			quality
		);
	});
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = () => reject(r.error ?? new Error('FileReader error'));
		r.readAsDataURL(blob);
	});
}
