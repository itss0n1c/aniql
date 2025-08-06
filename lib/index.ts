import type { FieldsSelection, Mutation, MutationGenqlSelection, Query, QueryGenqlSelection } from './genql';
import { type ClientOptions, createFetcher, generateGraphqlOperation, linkTypeMap } from './genql/runtime';
import types from './genql/types';

/** Represents a value that can be awaited. */
export type Awaitable<T> = Promise<T> | T;

interface AniQLAuthBase {
	client_id: number;
}

interface AniQLAuthResCode extends AniQLAuthBase {
	response_type: 'code';
	client_secret: string;
	redirect_uri: string;
}

interface AniQLAuthResToken extends AniQLAuthBase {
	response_type: 'token';
}

export type AniQLAuth = AniQLAuthResCode | AniQLAuthResToken;

/** Options for the AniQL client. */
export type AniQLOptions = ClientOptions & {
	auth: AniQLAuth;
	get_token?: () => Awaitable<string | undefined>;
};

/** Options for the request made by the AniQL client. */
export type AniQLRequestOptions = { token?: string };

const typeMap = linkTypeMap(types as any);
const typeMapQuery = typeMap.Query;
const typeMapMutation = typeMap.Mutation;
if (!typeMapQuery || !typeMapMutation) throw new Error('Query or Mutation root is missing in type map');

const _make_query = <R extends QueryGenqlSelection>(request: R & { __name?: string }) =>
	generateGraphqlOperation('query', typeMapQuery, request as any);
const _make_mutation = <R extends QueryGenqlSelection>(request: R & { __name?: string }) =>
	generateGraphqlOperation('mutation', typeMapMutation, request as any);

/**
 * AniQLClientError is an error class for errors that occur in the AniQL client.
 *
 * It extends the built-in Error class and includes a status code.
 */
export class AniQLClientError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
		this.name = 'AniQLClientError';
	}
}

export type RateLimitData = { limit: number; remaining: number; reset: number };
export interface AniQLClientEvents {
	rate_limit: Array<(data: RateLimitData) => Awaitable<any>>;
}

/**
 * AniQLClient is a client for interacting with the AniList GraphQL API.
 * It allows you to perform queries and mutations against the AniList API.
 * You can also get the login URL to authenticate users.
 *
 * The client will automatically include the token, if provided via options, in the Authorization header for requests.
 *
 * For documentation on the AniList API, see https://docs.anilist.co/
 */
export class AniQLClient {
	#_opts: AniQLOptions;
	static base_url = 'https://graphql.anilist.co';
	rate_limit: RateLimitData = { limit: 90, remaining: 90, reset: 0 };

	#_events: AniQLClientEvents = {
		rate_limit: [],
	};

	on<K extends keyof AniQLClientEvents>(event: K, listener: AniQLClientEvents[K][number]): this {
		if (!this.#_events[event]) this.#_events[event] = [];
		this.#_events[event].push(listener);
		return this;
	}

	#_rate_limit_send = (data: RateLimitData) => this.#_events.rate_limit.forEach((cb) => cb(data));

	#_rate_limit_handle = () => {
		if (this.rate_limit.reset <= 0) clearInterval(this.#_emit_listener);
		this.#_rate_limit_send(this.rate_limit);
		this.rate_limit.reset--;
	};

	#_emit_listener?: ReturnType<(typeof globalThis)['setInterval']>;
	#_emit_rate_limit(data: RateLimitData) {
		if (this.#_emit_listener) clearInterval(this.#_emit_listener);
		this.rate_limit = data;
		if (this.rate_limit.reset >= 1) {
			this.#_rate_limit_handle();
			this.#_emit_listener = setInterval.bind(this, this.#_rate_limit_handle, 1000)();
		}
		this.#_rate_limit_send(data);
	}

	constructor(opts: AniQLOptions) {
		this.#_opts = opts;
	}

	async query<R extends QueryGenqlSelection>(
		request: R & { __name?: string },
		opts?: AniQLRequestOptions,
	): Promise<FieldsSelection<Query, R>> {
		const operation = _make_query(request);
		return this.#_fetcher(opts?.token)(operation);
	}

	async mutation<R extends MutationGenqlSelection>(
		request: R & { __name?: string },
		opts?: AniQLRequestOptions,
	): Promise<FieldsSelection<Mutation, R>> {
		const operation = _make_mutation(request);
		return this.#_fetcher(opts?.token)(operation);
	}

	make_query = <R extends QueryGenqlSelection>(request: R & { __name?: string }) => request;
	make_mutation = <R extends MutationGenqlSelection>(request: R & { __name?: string }) => request;

	#_fetcher(_token?: string) {
		return createFetcher({
			fetcher: async (operation) => {
				const token = _token ?? (await this.#_opts?.get_token?.());
				let res: Response;
				try {
					res = await fetch(AniQLClient.base_url, {
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							...(token ? { Authorization: `Bearer ${token}` } : {}),
						},
						body: JSON.stringify(operation),
					});
				} catch (e) {
					if (e instanceof TypeError) {
						if (e.message.includes('NetworkError'))
							this.#_emit_rate_limit({ limit: 0, remaining: 0, reset: 60 });
					}
					throw e;
				}

				const _limit = Number.parseInt(res.headers.get('x-ratelimit-limit') ?? '0');
				const _remaining = Number.parseInt(res.headers.get('x-ratelimit-remaining') ?? '0');
				const __reset = res.headers.get('x-ratelimit-reset');
				let reset_count: number | undefined;
				if (__reset) {
					const _reset = Number.parseInt(__reset ?? '');
					if (!Number.isNaN(_reset))
						reset_count = Math.floor((new Date(_reset * 1000).getTime() - Date.now()) / 1000);
				} else {
					const retry_after = res.headers.get('retry-after');
					if (retry_after) {
						const _reset = Number.parseInt(retry_after ?? '');
						if (!Number.isNaN(_reset))
							reset_count = Math.floor(
								(new Date(Date.now() + _reset * 1000).getTime() - Date.now()) / 1000,
							);
					}
				}
				const limit = Number.isNaN(_limit) ? 0 : _limit;
				const remaining = Number.isNaN(_remaining) ? 0 : _remaining;

				const reset = reset_count ?? 60;
				console.log(res.status, reset);

				this.#_emit_rate_limit({
					limit,
					remaining,
					reset,
				});

				if (res.status === 429) throw new AniQLClientError(429, 'Rate limit exceeded');

				return await res.json();
			},
		});
	}

	get auth_url() {
		const auth = this.#_opts.auth;
		const url = new URL('https://anilist.co/api/v2/oauth/authorize');
		url.searchParams.append('client_id', auth.client_id.toString());
		url.searchParams.append('response_type', auth.response_type);
		if (auth.response_type === 'code') url.searchParams.append('redirect_uri', auth.redirect_uri);
		return url.toString();
	}

	async auth_exchange(code: string) {
		const auth = this.#_opts.auth;
		if (auth.response_type !== 'code')
			throw new AniQLClientError(400, 'auth_exchange is only valid for response_type "code"');
		const res = await fetch('https://anilist.co/api/v2/oauth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				grant_type: 'authorization_code',
				client_id: auth.client_id,
				client_secret: auth.client_secret,
				redirect_uri: auth.redirect_uri,
				code: code,
			}),
		});
		if (!res.ok) throw new AniQLClientError(res.status, `Failed to exchange code: ${res.statusText}`);
		return res.json() as Promise<{
			access_token: string;
			token_type: string;
			expires_in: number;
			refresh_token: string;
		}>;
	}
}

export * from './genql';
