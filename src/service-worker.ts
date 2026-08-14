/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// SvelteKit builds and auto-registers this file. It powers PWA installability
// and instant launches by precaching the app *shell* (hashed JS/CSS/fonts/
// icons) — it deliberately never caches mail: API responses and page
// navigations always go to the network, so message content is never stale.
// On a failed navigation (offline) the user sees a small offline fallback.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `ameera-shell-${version}`;
const OFFLINE_URL = '/offline.html';

// Sender/company avatars, cached locally per browser so repeat loads are
// instant. Unversioned name on purpose: avatars are immutable per sender and
// the server is the source of truth, so this cache should survive app
// deploys instead of being wiped each time the shell version bumps. A fresh
// browser simply rebuilds it from the (already-warm) server cache.
const AVATAR_CACHE = 'ameera-avatars-v1';
const AVATAR_PATH = '/api/avatar';
const AVATAR_MAX_ENTRIES = 600;

// Immutable, content-hashed app-shell assets. `files` (static/) includes the
// manifest, icons, robots.txt, and our offline fallback page.
const PRECACHE = [...build, ...files];
const PRECACHE_SET = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			// NOTE: deliberately NO skipWaiting(). Forcing activation while a
			// navigation is in flight makes the browser re-issue that
			// navigation under the new worker — which shows up as the page
			// refreshing twice. In dev the SW re-installs on every load, so
			// skipWaiting() turned every manual refresh into a double refresh.
			// A new worker now waits for the standard lifecycle (all tabs
			// closed) before taking over, which is fine: the shell is tiny and
			// navigations are network-first anyway.
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Drop superseded shell caches, but keep the (unversioned) avatar
			// cache so it persists across deploys. No clients.claim() — see the
			// skipWaiting note above; we let the worker take control through the
			// normal lifecycle rather than seizing in-flight clients.
			const keep = new Set([CACHE, AVATAR_CACHE]);
			for (const key of await caches.keys()) {
				if (!keep.has(key)) await caches.delete(key);
			}
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// 0) Sender avatars: cache-first in their own bucket. Each avatar is
	//    keyed by its ?email= URL and is effectively immutable, so a cache hit
	//    is always correct. Only 200s are cached — a 204 "no avatar" stays
	//    uncached so it can fill in once the server resolves it.
	if (url.pathname === AVATAR_PATH) {
		event.respondWith(avatarCacheFirst(request));
		return;
	}

	// 1) App-shell assets: cache-first. They're content-hashed, so a cache hit
	//    is always correct and a new build produces new URLs.
	if (PRECACHE_SET.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				return cached ?? fetch(request);
			})()
		);
		return;
	}

	// 2) Page navigations: network-first so mail is always live. Fall back to
	//    the cached offline page only when the network is unreachable.
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					const cache = await caches.open(CACHE);
					const offline = await cache.match(OFFLINE_URL);
					return (
						offline ??
						new Response('Offline', { status: 503, statusText: 'Offline' })
					);
				}
			})()
		);
		return;
	}

	// 3) Everything else (API/JMAP/mail data, SSE, uploads): leave untouched so
	//    it always hits the network and is never cached.
});

async function avatarCacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(AVATAR_CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	try {
		const res = await fetch(request);
		if (res.status === 200) {
			await cache.put(request, res.clone());
			void trimAvatarCache(cache);
		}
		return res;
	} catch {
		// Offline and not cached — let the <img> fall back to initials.
		return new Response(null, { status: 504 });
	}
}

// Crude FIFO bound so a long-lived browser doesn't grow the avatar cache
// without limit. Cache.keys() preserves insertion order, so deleting from the
// front drops the oldest entries.
async function trimAvatarCache(cache: Cache): Promise<void> {
	const keys = await cache.keys();
	if (keys.length <= AVATAR_MAX_ENTRIES) return;
	for (const req of keys.slice(0, keys.length - AVATAR_MAX_ENTRIES)) {
		await cache.delete(req);
	}
}
