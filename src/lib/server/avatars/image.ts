/**
 * Identify an image by its magic bytes. We rely on this rather than the
 * server-declared Content-Type because favicon endpoints frequently return an
 * HTML error page with a 200 + `image/x-icon` header; sniffing the actual
 * bytes lets us reject those (returns null) and serve a trustworthy
 * Content-Type to the browser.
 */
export function sniffImage(bytes: Buffer): string | null {
	if (bytes.length < 4) return null;

	// PNG
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
		return 'image/png';
	// JPEG
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	// GIF
	if (bytes.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
	// WEBP: 'RIFF' .... 'WEBP'
	if (
		bytes.length >= 12 &&
		bytes.toString('ascii', 0, 4) === 'RIFF' &&
		bytes.toString('ascii', 8, 12) === 'WEBP'
	)
		return 'image/webp';
	// ICO (icon directory): 00 00 01 00
	if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00)
		return 'image/x-icon';
	// BMP
	if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';

	// SVG / XML-wrapped SVG. Scan a generous prefix because the <svg> tag may
	// sit after an <?xml …?> declaration, a doctype, or comments.
	const head = bytes.toString('utf8', 0, Math.min(bytes.length, 1024)).toLowerCase();
	if (head.includes('<svg')) return 'image/svg+xml';

	return null;
}
