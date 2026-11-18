import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { AniQLClient, AniQLClientError, type RateLimitData } from './index.ts';

const query = { User: { __args: { name: 'itss0n1c' }, id: true } } as const;
const response = () => Response.json({ data: { User: { id: 123 } } });

afterEach(() => mock.restore());

test('public queries work without OAuth or an Authorization header', async () => {
	const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => response());
	for (const client of [new AniQLClient(), new AniQLClient({ client_id: 123 })]) {
		expect(await client.query(query)).toEqual({ User: { id: 123 } });
	}
	for (const [, init] of fetch.mock.calls) {
		expect(new Headers(init?.headers).has('Authorization')).toBe(false);
	}
});

test('request token overrides get_token, which takes precedence over the static token', async () => {
	const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => response());
	let current: string | undefined = 'dynamic';
	const get_token = mock(async () => current);
	const client = new AniQLClient({ token: 'static', get_token });

	await client.query(query, { token: 'request' });
	expect(get_token).not.toHaveBeenCalled();
	await client.query(query);
	current = undefined;
	await client.query(query);
	expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'))).toEqual([
		'Bearer request',
		'Bearer dynamic',
		'Bearer static',
	]);
});

test('client and request abort signals reach fetch', async () => {
	const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => response());
	const defaults = new AbortController();
	const request = new AbortController();
	const client = new AniQLClient({ signal: defaults.signal });
	await client.query(query);
	await client.query(query, { signal: request.signal });
	request.abort();
	await expect(client.query(query, { signal: request.signal })).rejects.toHaveProperty('name', 'AbortError');
	expect(fetch.mock.calls.map(([, init]) => init?.signal)).toEqual([defaults.signal, request.signal]);
});

test('OAuth helpers require OAuth configuration', async () => {
	const client = new AniQLClient({ client_id: 123 });
	expect(() => client.auth_url).toThrow(AniQLClientError);
	await expect(client.auth_exchange('test-code')).rejects.toBeInstanceOf(AniQLClientError);
	const oauth = new AniQLClient({ auth: { client_id: 123, response_type: 'token' } });
	expect(new URL(oauth.auth_url).searchParams.get('client_id')).toBe('123');
});

test('rate limit state uses a deadline without scheduling a timer for unsubscribed clients', async () => {
	const now = spyOn(Date, 'now').mockReturnValue(0);
	const interval = spyOn(globalThis, 'setInterval');
	spyOn(globalThis, 'fetch').mockImplementation(async () =>
		Response.json({}, { status: 429, headers: { 'retry-after': '2' } }),
	);
	const client = new AniQLClient();
	await expect(client.query(query)).rejects.toHaveProperty('status', 429);
	expect(interval).not.toHaveBeenCalled();
	expect(client.rate_limit.reset).toBe(2);
	now.mockReturnValue(3000);
	expect(client.rate_limit.reset).toBe(0);
});

test('rate limit listeners receive one initial event and a final zero without mutating snapshots', async () => {
	const now = spyOn(Date, 'now').mockReturnValue(0);
	const interval = spyOn(globalThis, 'setInterval');
	spyOn(globalThis, 'fetch').mockImplementation(async () =>
		Response.json({ data: {} }, { headers: { 'x-ratelimit-reset': '1', 'x-ratelimit-remaining': '89' } }),
	);
	const events: RateLimitData[] = [];
	const client = new AniQLClient().on('rate_limit', (data) => events.push(data));
	await client.query(query);
	expect(events.map(({ reset }) => reset)).toEqual([1]);
	now.mockReturnValue(1000);
	interval.mock.calls[0]?.[0]();
	expect(events.map(({ reset }) => reset)).toEqual([1, 0]);
	expect(client.rate_limit.reset).toBe(0);
});
