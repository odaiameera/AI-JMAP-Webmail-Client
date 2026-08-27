/**
 * Client-side avatar preparation, shared by the personal profile photo and
 * per-account avatars.
 *
 * Downscaling here rather than server-side is what keeps avatar storage
 * trivial: a 256px JPEG at q0.85 lands around 10-25KB, so the data: URL these
 * produce is small enough to store as-is and cheap enough to serve on every
 * account row. Both callers hit the same 2MB server cap, which after this is
 * effectively unreachable — it's a guard against a caller that skipped this,
 * not a working limit.
 */

const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.85;

/** Downscale and re-encode a data: URL to a JPEG data: URL. */
export function resizeImage(dataUrl: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
			const w = Math.round(img.width * scale);
			const h = Math.round(img.height * scale);
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) return reject(new Error('no ctx'));
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
		};
		img.onerror = () => reject(new Error('image load failed'));
		img.src = dataUrl;
	});
}

/**
 * Read a picked file and return a compressed data: URL. Falls back to the
 * original bytes if the canvas step fails, so an unusual format still saves.
 */
export function fileToAvatarDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = async () => {
			const raw = reader.result as string;
			try {
				resolve(await resizeImage(raw));
			} catch {
				resolve(raw);
			}
		};
		reader.onerror = () => reject(new Error('file read failed'));
		reader.readAsDataURL(file);
	});
}
