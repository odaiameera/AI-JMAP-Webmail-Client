import type { AttachmentKind } from './types';

const TEXT_EXTS = new Set([
	'txt', 'md', 'markdown', 'log', 'json', 'csv', 'tsv', 'xml',
	'yml', 'yaml', 'toml', 'ini', 'cfg',
	'js', 'ts', 'jsx', 'tsx', 'svelte', 'vue', 'html', 'css', 'scss',
	'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'sql'
]);

const IMAGE_TYPES = new Set([
	'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
	'image/webp', 'image/svg+xml', 'image/bmp'
]);

export function detectKind(mimeType: string, filename: string | null): AttachmentKind {
	const mime = (mimeType ?? '').toLowerCase();
	const ext = (filename ?? '').toLowerCase().split('.').pop() ?? '';

	if (IMAGE_TYPES.has(mime) || mime.startsWith('image/')) return 'image';
	if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
	if (
		mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		ext === 'docx'
	) return 'docx';
	if (
		mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
		mime === 'application/vnd.ms-excel' ||
		ext === 'xlsx' || ext === 'xls'
	) return 'xlsx';
	if (mime.startsWith('text/') || TEXT_EXTS.has(ext)) return 'text';

	return 'unsupported';
}
