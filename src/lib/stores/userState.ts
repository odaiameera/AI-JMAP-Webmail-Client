import { writable } from 'svelte/store';

/**
 * Single source of truth on the client for everything that lives in the
 * server-side SQLite. Components subscribe and use the helpers below to
 * read/write — no fetch calls scattered across the UI.
 */
export interface AvatarValue {
	data: string;
	offset: { x: number; y: number; zoom: number };
}

export interface LabelMetaValue {
	mailboxId: string;
	displayName: string;
	color: string;
}

export interface FolderMetaValue {
	mailboxId: string;
	displayName: string;
	color: string;
	icon: string | null;
}

export interface SignatureValue {
	id: number;
	name: string;
	html: string;
	isDefault: boolean;
}

export interface IdentityValue {
	jmapId: string;
	email: string;
	name: string | null;
	replyTo: string | null;
	isPrimary: boolean;
}

export interface UserStateSnapshot {
	loaded: boolean;
	displayName: string | null;
	avatar: AvatarValue | null;
	settings: Record<string, unknown>;
	labels: Map<string, LabelMetaValue>;
	folders: Map<string, FolderMetaValue>;
	signatures: SignatureValue[];
	identities: IdentityValue[];
	identitySignatures: Map<string, number>;
}

const initial: UserStateSnapshot = {
	loaded: false,
	displayName: null,
	avatar: null,
	settings: {},
	labels: new Map(),
	folders: new Map(),
	signatures: [],
	identities: [],
	identitySignatures: new Map()
};

export const userState = writable<UserStateSnapshot>(initial);

async function getJson<T>(url: string, fallback: T): Promise<T> {
	try {
		const res = await fetch(url);
		if (!res.ok) return fallback;
		return (await res.json()) as T;
	} catch {
		return fallback;
	}
}

export async function loadUserState(): Promise<void> {
	const [settings, avatar, labels, folders, signatures, identities, identitySignatures] =
		await Promise.all([
			getJson<{ displayName: string | null; settings: Record<string, unknown> } | null>(
				'/api/user-state/settings',
				null
			),
			getJson<AvatarValue | null>('/api/user-state/avatar', null),
			getJson<LabelMetaValue[]>('/api/user-state/labels', []),
			getJson<FolderMetaValue[]>('/api/user-state/folders', []),
			getJson<SignatureValue[]>('/api/user-state/signatures', []),
			getJson<IdentityValue[]>('/api/identities', []),
			getJson<Array<{ identityId: string; signatureId: number }>>(
				'/api/user-state/identity-signatures',
				[]
			)
		]);

	userState.set({
		loaded: true,
		displayName: settings?.displayName ?? null,
		avatar: avatar ?? null,
		settings: settings?.settings ?? {},
		labels: new Map(labels.map((l) => [l.mailboxId, l])),
		folders: new Map(folders.map((f) => [f.mailboxId, f])),
		signatures,
		identities,
		identitySignatures: new Map(identitySignatures.map((m) => [m.identityId, m.signatureId]))
	});
}

export async function refreshIdentities(): Promise<IdentityValue[]> {
	const res = await fetch('/api/identities/sync', { method: 'POST' });
	if (!res.ok) throw new Error(`Sync failed (${res.status})`);
	const identities = (await res.json()) as IdentityValue[];
	userState.update((s) => ({ ...s, identities }));
	return identities;
}

export async function setIdentitySignature(identityId: string, signatureId: number): Promise<void> {
	await fetch('/api/user-state/identity-signatures', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ identityId, signatureId })
	});
	userState.update((s) => {
		const next = new Map(s.identitySignatures);
		next.set(identityId, signatureId);
		return { ...s, identitySignatures: next };
	});
}

export async function clearIdentitySignature(identityId: string): Promise<void> {
	await fetch(
		`/api/user-state/identity-signatures?identityId=${encodeURIComponent(identityId)}`,
		{ method: 'DELETE' }
	);
	userState.update((s) => {
		const next = new Map(s.identitySignatures);
		next.delete(identityId);
		return { ...s, identitySignatures: next };
	});
}

export async function setAvatar(
	data: string,
	offset: { x: number; y: number; zoom: number }
): Promise<void> {
	await fetch('/api/user-state/avatar', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ data, offset })
	});
	userState.update((s) => ({ ...s, avatar: { data, offset } }));
}

export async function clearAvatar(): Promise<void> {
	await fetch('/api/user-state/avatar', { method: 'DELETE' });
	userState.update((s) => ({ ...s, avatar: null }));
}

export async function updateSettings(patch: {
	displayName?: string;
	settings?: Record<string, unknown>;
}): Promise<void> {
	await fetch('/api/user-state/settings', {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
	userState.update((s) => ({
		...s,
		displayName: patch.displayName ?? s.displayName,
		settings: patch.settings ? { ...s.settings, ...patch.settings } : s.settings
	}));
}

export async function setLabelMeta(
	mailboxId: string,
	patch: { displayName?: string; color?: string }
): Promise<void> {
	await fetch(`/api/user-state/labels/${encodeURIComponent(mailboxId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
	userState.update((s) => {
		const next = new Map(s.labels);
		const existing = next.get(mailboxId) ?? {
			mailboxId,
			displayName: '',
			color: '#8B5CF6'
		};
		next.set(mailboxId, { ...existing, ...patch });
		return { ...s, labels: next };
	});
}

export async function deleteLabelMeta(mailboxId: string): Promise<void> {
	await fetch(`/api/user-state/labels/${encodeURIComponent(mailboxId)}`, { method: 'DELETE' });
	userState.update((s) => {
		const next = new Map(s.labels);
		next.delete(mailboxId);
		return { ...s, labels: next };
	});
}

export async function setFolderMeta(
	mailboxId: string,
	patch: { displayName?: string; color?: string; icon?: string | null }
): Promise<void> {
	await fetch(`/api/user-state/folders/${encodeURIComponent(mailboxId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
	userState.update((s) => {
		const next = new Map(s.folders);
		const existing = next.get(mailboxId) ?? {
			mailboxId,
			displayName: '',
			color: '#8B5CF6',
			icon: null
		};
		next.set(mailboxId, { ...existing, ...patch });
		return { ...s, folders: next };
	});
}

export async function deleteFolderMeta(mailboxId: string): Promise<void> {
	await fetch(`/api/user-state/folders/${encodeURIComponent(mailboxId)}`, { method: 'DELETE' });
	userState.update((s) => {
		const next = new Map(s.folders);
		next.delete(mailboxId);
		return { ...s, folders: next };
	});
}

export async function createSignature(
	name: string,
	html: string,
	isDefault = false
): Promise<SignatureValue> {
	const res = await fetch('/api/user-state/signatures', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name, html, isDefault })
	});
	const sig = (await res.json()) as SignatureValue;
	userState.update((s) => ({
		...s,
		signatures: isDefault
			? [...s.signatures.map((x) => ({ ...x, isDefault: false })), sig]
			: [...s.signatures, sig]
	}));
	return sig;
}

export async function updateSignature(
	id: number,
	patch: { name?: string; html?: string; isDefault?: boolean }
): Promise<void> {
	await fetch(`/api/user-state/signatures/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
	userState.update((s) => ({
		...s,
		signatures: s.signatures.map((sig) => {
			if (sig.id === id) return { ...sig, ...patch };
			if (patch.isDefault === true) return { ...sig, isDefault: false };
			return sig;
		})
	}));
}

export async function deleteSignature(id: number): Promise<void> {
	await fetch(`/api/user-state/signatures/${id}`, { method: 'DELETE' });
	userState.update((s) => ({
		...s,
		signatures: s.signatures.filter((sig) => sig.id !== id)
	}));
}
