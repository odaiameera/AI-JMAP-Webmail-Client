export type AttachmentKind =
	| 'image'
	| 'pdf'
	| 'text'
	| 'docx'
	| 'xlsx'
	| 'unsupported';

export interface ViewerAttachment {
	emailId: string;
	blobId: string;
	name: string;
	type: string;
	size: number;
	kind: AttachmentKind;
}
