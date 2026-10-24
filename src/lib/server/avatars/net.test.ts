import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from './net';

// Public IP literals, so no test depends on DNS.
const PUBLIC = 'https://93.184.215.14';
const OTHER = 'https://93.184.215.15';

function stubFetch(...responses: Response[]) {
	const fetchMock = vi.fn(async () => responses.shift() ?? new Response('', { status: 599 }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('safeFetch', () => {
	it('never connects to loopback, private or link-local hosts', async () => {
		const fetchMock = stubFetch();
		for (const url of [
			'https://127.0.0.1/',
			'https://10.0.0.5/',
			'https://192.168.1.1/',
			'https://169.254.169.254/latest/meta-data',
			'https://[::1]/',
			'https://localhost/',
			'https://router.lan/'
		]) {
			expect(await safeFetch(url, { method: 'POST', body: 'x' })).toBeNull();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends a POST with its body and content type', async () => {
		const fetchMock = stubFetch(new Response('ok', { status: 200 }));
		const res = await safeFetch(`${PUBLIC}/u`, {
			method: 'POST',
			body: 'List-Unsubscribe=One-Click',
			contentType: 'application/x-www-form-urlencoded'
		});
		expect(res?.status).toBe(200);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(init.method).toBe('POST');
		expect(init.body).toBe('List-Unsubscribe=One-Click');
		expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
	});

	it('refuses a redirect into the private network', async () => {
		const fetchMock = stubFetch(
			new Response(null, { status: 307, headers: { location: 'https://127.0.0.1/admin' } })
		);
		expect(await safeFetch(`${PUBLIC}/u`, { method: 'POST', body: 'x' })).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps the POST across a 307/308 and drops to GET on a 303', async () => {
		const fetchMock = stubFetch(
			new Response(null, { status: 307, headers: { location: `${OTHER}/a` } }),
			new Response(null, { status: 303, headers: { location: `${OTHER}/done` } }),
			new Response('done', { status: 200 })
		);
		expect((await safeFetch(`${PUBLIC}/u`, { method: 'POST', body: 'x' }))?.status).toBe(200);
		const inits = fetchMock.mock.calls.map((c) => (c as unknown as [URL, RequestInit])[1]);
		expect(inits.map((i) => i.method)).toEqual(['POST', 'POST', 'GET']);
		expect(inits[2].body).toBeUndefined();
	});

	it('still defaults to a GET', async () => {
		const fetchMock = stubFetch(new Response('img', { status: 200 }));
		await safeFetch(`${PUBLIC}/a.png`);
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(init.method ?? 'GET').toBe('GET');
		expect(init.body).toBeUndefined();
	});

	it('counts an empty answer as a failure unless the caller expects one', async () => {
		stubFetch(new Response(null, { status: 204 }), new Response(null, { status: 204 }));
		expect(await safeFetch(`${PUBLIC}/a.png`)).toBeNull();
		const res = await safeFetch(`${PUBLIC}/u`, { method: 'POST', body: 'x', allowEmpty: true });
		expect(res?.status).toBe(204);
		expect(res?.bytes.length).toBe(0);
	});
});
