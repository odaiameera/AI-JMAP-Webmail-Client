import { describe, expect, it } from 'vitest';
import { imageSize, sniffImage } from './image';

/**
 * `imageSize` is what decides which favicon a sender gets, so the headers it
 * parses are built here by hand rather than mocked — a wrong offset would
 * silently downgrade every avatar back to the blurry one.
 */

function png(width: number, height: number): Buffer {
	const b = Buffer.alloc(24);
	b.write('\x89PNG\r\n\x1a\n', 0, 'binary');
	b.writeUInt32BE(13, 8); // IHDR length
	b.write('IHDR', 12, 'ascii');
	b.writeUInt32BE(width, 16);
	b.writeUInt32BE(height, 20);
	return b;
}

function gif(width: number, height: number): Buffer {
	const b = Buffer.alloc(10);
	b.write('GIF89a', 0, 'ascii');
	b.writeUInt16LE(width, 6);
	b.writeUInt16LE(height, 8);
	return b;
}

/** ICO with one entry per size; 0 in the header byte means 256. */
function ico(sizes: number[]): Buffer {
	const b = Buffer.alloc(6 + sizes.length * 16);
	b.writeUInt16LE(0, 0);
	b.writeUInt16LE(1, 2); // type: icon
	b.writeUInt16LE(sizes.length, 4);
	sizes.forEach((s, i) => {
		const off = 6 + i * 16;
		b[off] = s >= 256 ? 0 : s;
		b[off + 1] = s >= 256 ? 0 : s;
	});
	return b;
}

function jpeg(width: number, height: number): Buffer {
	// SOI, a JFIF APP0 to skip over, then SOF0 carrying the dimensions.
	const app0 = Buffer.alloc(20);
	app0.writeUInt16BE(0xffe0, 0);
	app0.writeUInt16BE(16, 2); // segment length
	const sof = Buffer.alloc(11);
	sof.writeUInt16BE(0xffc0, 0);
	sof.writeUInt16BE(11, 2);
	sof[4] = 8; // precision
	sof.writeUInt16BE(height, 5);
	sof.writeUInt16BE(width, 7);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

describe('imageSize', () => {
	it('reads PNG dimensions from IHDR', () => {
		expect(imageSize(png(180, 180), 'image/png')).toBe(180);
		expect(imageSize(png(16, 16), 'image/png')).toBe(16);
	});

	it('reports the shorter side, so a wide banner is not mistaken for a big icon', () => {
		expect(imageSize(png(512, 64), 'image/png')).toBe(64);
	});

	it('reads GIF and JPEG headers', () => {
		expect(imageSize(gif(48, 48), 'image/gif')).toBe(48);
		expect(imageSize(jpeg(256, 256), 'image/jpeg')).toBe(256);
	});

	it('takes the largest entry in a multi-size ICO', () => {
		expect(imageSize(ico([16, 32, 48]), 'image/x-icon')).toBe(48);
	});

	it('decodes the 0-means-256 convention in ICO', () => {
		expect(imageSize(ico([256]), 'image/x-icon')).toBe(256);
	});

	it('treats SVG as unbounded so a vector mark outranks any raster', () => {
		expect(imageSize(Buffer.from('<svg xmlns="..."/>'), 'image/svg+xml')).toBe(Infinity);
		expect(Infinity > 180).toBe(true);
	});

	it('returns 0 rather than throwing on a truncated or unknown header', () => {
		expect(imageSize(Buffer.alloc(3), 'image/png')).toBe(0);
		expect(imageSize(png(64, 64), 'image/tiff')).toBe(0);
		expect(imageSize(Buffer.alloc(0), 'image/jpeg')).toBe(0);
	});
});

describe('sniffImage still agrees with imageSize', () => {
	it('identifies the formats the size reader handles', () => {
		expect(sniffImage(png(64, 64))).toBe('image/png');
		expect(sniffImage(gif(64, 64))).toBe('image/gif');
		expect(sniffImage(ico([32]))).toBe('image/x-icon');
		expect(sniffImage(jpeg(64, 64))).toBe('image/jpeg');
	});
});
