import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { findExistingCopy, summarizeInvitation } from '$lib/server/calendar/imip';
import { listCalendarsWithMeta } from '$lib/server/calendar/service';

/**
 * Inspect a `text/calendar` part of an email: download the blob, parse the
 * iMIP payload and report what the invitation card needs — event summary,
 * METHOD, the user's RSVP state, whether a copy already sits on one of
 * their calendars, and the calendars they can add it to.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);

	const blobId = url.searchParams.get('blobId');
	if (!blobId) return json({ error: 'blobId is required' }, { status: 400 });

	const downloadUrl = `${locals.auth.apiUrl}download/${locals.auth.accountId}/${encodeURIComponent(blobId)}/invite.ics`;
	let ics: string;
	try {
		const res = await fetch(downloadUrl, {
			headers: { Authorization: locals.auth.authHeader }
		});
		if (!res.ok) return json({ error: `Download failed (${res.status})` }, { status: 502 });
		ics = await res.text();
	} catch {
		return json({ error: 'Download failed' }, { status: 502 });
	}

	const summary = summarizeInvitation(ics, userEmail);
	if (!summary) return json({ found: false });

	try {
		const calendars = await listCalendarsWithMeta(locals.auth, userEmail);
		const existing = await findExistingCopy(locals.auth, userEmail, summary.uid, calendars);
		return json({
			found: true,
			...summary,
			// The stored copy's RSVP wins over the emailed snapshot.
			myStatus: existing?.myStatus ?? summary.myStatus,
			existing,
			calendars: calendars.filter((c) => !c.hidden)
		});
	} catch {
		// Calendar server unreachable — still render the parsed summary.
		return json({ found: true, ...summary, existing: null, calendars: [] });
	}
};
