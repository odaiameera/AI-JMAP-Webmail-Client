import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { buildJmapFilter } from '$lib/server/rules';
import type { Rule, RuleAction } from '$lib/types/rules';
import type { Email } from '$lib/jmap/types';

const PAGE = 200;
const BATCH = 50;

interface ActionCtx {
	inboxId?: string;
	trashId?: string;
}

/**
 * Translate a single rule's actions into a JMAP Email/set update patch for
 * one email. Keep the email in its source folder by default — only
 * `moveToFolder` and `delete` detach from the inbox.
 *
 * `applyLabel` ADDS the label mailbox to `mailboxIds` (multi-mailbox
 * membership is exactly the model Phase 1 established) — it does NOT
 * overwrite, which would remove the email from the inbox.
 */
function buildUpdates(email: Email, rule: Rule, ctx: ActionCtx): Record<string, unknown> {
	const patch: Record<string, unknown> = {};

	for (const action of rule.actions) {
		applyAction(patch, email, action, ctx);
	}
	return patch;
}

function applyAction(
	patch: Record<string, unknown>,
	email: Email,
	action: RuleAction,
	ctx: ActionCtx
): void {
	switch (action.type) {
		case 'applyLabel':
			if (action.value && !email.mailboxIds[action.value]) {
				patch[`mailboxIds/${action.value}`] = true;
			}
			break;
		case 'markRead':
			if (!email.keywords['$seen']) patch['keywords/$seen'] = true;
			break;
		case 'markImportant':
			if (!email.keywords['$flagged']) patch['keywords/$flagged'] = true;
			break;
		case 'moveToFolder':
			if (action.value) {
				patch[`mailboxIds/${action.value}`] = true;
				// Rule-context "move" only detaches from the inbox for safety —
				// Phase 4's doc spells this out: moving from arbitrary folders
				// via a rule isn't supported yet.
				if (ctx.inboxId && email.mailboxIds[ctx.inboxId] && action.value !== ctx.inboxId) {
					patch[`mailboxIds/${ctx.inboxId}`] = null;
				}
			}
			break;
		case 'delete':
			if (ctx.trashId) {
				patch[`mailboxIds/${ctx.trashId}`] = true;
				if (ctx.inboxId && email.mailboxIds[ctx.inboxId]) {
					patch[`mailboxIds/${ctx.inboxId}`] = null;
				}
			}
			break;
		case 'stopProcessing':
			// Handled by the caller (skips subsequent rules).
			break;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) {
		return new Response('Not authenticated', { status: 401 });
	}

	const { rules } = (await request.json()) as { rules: Rule[] };
	const activeRules = (rules ?? []).filter((r) => r.enabled);
	const client = createClient(locals.auth);
	const { accountId } = locals.auth;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Controller closed mid-flight (client disconnected).
				}
			};

			let scanned = 0;
			let matched = 0;
			let applied = 0;
			let failed = 0;
			let failedReason = '';
			let total = 0;

			try {
				if (activeRules.length === 0) {
					send({ type: 'done', scanned: 0, matched: 0, applied: 0, failed: 0 });
					return;
				}

				const mailboxes = await getMailboxes(client, accountId);
				const ctx: ActionCtx = {
					inboxId: mailboxes.find((m) => m.role === 'inbox')?.id,
					trashId: mailboxes.find((m) => m.role === 'trash')?.id
				};

				// Preflight: a rule whose label/folder target was deleted would
				// "apply" as a stream of server-side rejections. Name the broken
				// rule instead of pretending it ran.
				const validIds = new Set(mailboxes.map((m) => m.id));
				for (const rule of activeRules) {
					const stale = rule.actions.find(
						(a) =>
							(a.type === 'moveToFolder' || a.type === 'applyLabel') &&
							a.value &&
							!validIds.has(a.value)
					);
					if (stale) {
						send({
							type: 'error',
							message: `Rule "${rule.name}" targets a ${stale.type === 'moveToFolder' ? 'folder' : 'label'} that no longer exists. Open the rule and pick the target again.`
						});
						return;
					}
					const unset = rule.actions.find(
						(a) => (a.type === 'moveToFolder' || a.type === 'applyLabel') && !a.value
					);
					if (unset) {
						send({
							type: 'error',
							message: `Rule "${rule.name}" has a ${unset.type === 'moveToFolder' ? '"move to folder"' : '"apply label"'} action with no target selected.`
						});
						return;
					}
				}

				// Estimate total up-front so the UI can render a progress bar.
				for (const rule of activeRules) {
					const filter = buildJmapFilter(rule);
					if (!filter) continue;
					const response = await client.request([
						[
							'Email/query',
							{ accountId, filter, calculateTotal: true, limit: 0 },
							'0'
						]
					]);
					const r = response.methodResponses[0][1] as { total?: number };
					total += r.total ?? 0;
				}
				send({ type: 'start', total });

				// Paginate matching emails per rule — no cap.
				for (const rule of activeRules) {
					const filter = buildJmapFilter(rule);
					if (!filter) continue;
					let position = 0;

					// Bounded loop for safety; real break condition is "page smaller than PAGE".
					for (let safety = 0; safety < 10_000; safety++) {
						const response = await client.request([
							['Email/query', { accountId, filter, position, limit: PAGE }, 'q'],
							[
								'Email/get',
								{
									accountId,
									'#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
									properties: ['id', 'keywords', 'mailboxIds']
								},
								'g'
							]
						]);

						const emails = (response.methodResponses[1][1] as { list: Email[] }).list ?? [];
						if (emails.length === 0) break;

						// Build patches for this page.
						const patches: Record<string, Record<string, unknown>> = {};
						for (const email of emails) {
							const p = buildUpdates(email, rule, ctx);
							if (Object.keys(p).length > 0) patches[email.id] = p;
						}

						scanned += emails.length;
						matched += emails.length; // pre-filtered, so every row matched

						// Send updates in JMAP-safe chunks. Count what the server
						// actually accepted — `notUpdated` rejections used to be
						// dropped on the floor, reporting success while folders
						// stayed empty.
						const entries = Object.entries(patches);
						for (let i = 0; i < entries.length; i += BATCH) {
							const chunk = Object.fromEntries(entries.slice(i, i + BATCH));
							const setRes = await client.request([
								['Email/set', { accountId, update: chunk }, '0']
							]);
							const result = setRes.methodResponses[0][1] as {
								updated?: Record<string, unknown> | null;
								notUpdated?: Record<string, { type?: string; description?: string }> | null;
							};
							applied += Object.keys(result.updated ?? {}).length;
							const rejected = Object.values(result.notUpdated ?? {});
							if (rejected.length > 0) {
								failed += rejected.length;
								if (!failedReason) {
									const first = rejected[0];
									failedReason = first.description ?? first.type ?? 'rejected by server';
								}
							}
						}

						send({ type: 'progress', scanned, matched, applied, failed, total });

						if (emails.length < PAGE) break;
						position += emails.length;
					}
				}

				send({ type: 'done', scanned, matched, applied, failed, failedReason });
			} catch (err) {
				send({
					type: 'error',
					message: err instanceof Error ? err.message : 'Apply failed'
				});
			} finally {
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
