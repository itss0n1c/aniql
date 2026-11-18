/** biome-ignore-all lint/suspicious/noExplicitAny: necessary for genql */
import type { FieldsSelection, Mutation, MutationGenqlSelection, Query, QueryGenqlSelection } from './genql/index.ts';
import { createFetcher, generateGraphqlOperation, linkTypeMap } from './genql/runtime/index.ts';
import types from './genql/types.ts';

export type Awaitable<T> = Promise<T> | T;

interface AniQLAuthBase {
	client_id: number;
}

export interface AniQLAuthResCode extends AniQLAuthBase {
	response_type: 'code';
	client_secret: string;
	redirect_uri: string;
}

export interface AniQLAuthResToken extends AniQLAuthBase {
	response_type: 'token';
}

export type AniQLAuth = AniQLAuthResCode | AniQLAuthResToken;

/** Options for the AniQL client. */
export interface AniQLOptions {
	/** Optional AniList app ID for clients that don't use the OAuth helpers. */
	client_id?: number;
	auth?: AniQLAuth;
	token?: string;
	get_token?: () => Awaitable<string | undefined>;
	signal?: AbortSignal;
}

/** Options for the request made by the AniQL client. */
export interface AniQLRequestOptions {
	token?: string;
	signal?: AbortSignal;
}

const typeMap = linkTypeMap(types as any);
const typeMapQuery = typeMap.Query;
const typeMapMutation = typeMap.Mutation;
if (!typeMapQuery || !typeMapMutation) throw new Error('Query or Mutation root is missing in type map');

const _make_query = <R extends QueryGenqlSelection>(request: R & { __name?: string }) =>
	generateGraphqlOperation('query', typeMapQuery, request as any);
const _make_mutation = <R extends MutationGenqlSelection>(request: R & { __name?: string }) =>
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

export interface RateLimitData {
	limit: number;
	remaining: number;
	reset: number;
}

export interface AniQLClientEvents {
	rate_limit: Array<(data: RateLimitData) => Awaitable<any>>;
}

function reset_deadline(headers: Headers, now: number, limited: boolean): number {
	const reset = headers.get('x-ratelimit-reset');
	if (reset && /^\d+$/.test(reset) && Number.isFinite(Number(reset) * 1000)) return Number(reset) * 1000;

	const retry = headers.get('retry-after');
	if (retry) {
		const deadline = /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry);
		if (Number.isFinite(deadline)) return deadline;
	}
	return limited ? now + 60_000 : now;
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
	#_rate_limit = { limit: 90, remaining: 90, deadline: 0 };

	get rate_limit(): RateLimitData {
		const { limit, remaining, deadline } = this.#_rate_limit;
		return { limit, remaining, reset: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) };
	}

	#_events: AniQLClientEvents = { rate_limit: [] };

	on<K extends keyof AniQLClientEvents>(event: K, listener: AniQLClientEvents[K][number]): this {
		this.#_events[event].push(listener);
		this.#_start_countdown();
		return this;
	}

	#_emit_listener?: ReturnType<(typeof globalThis)['setInterval']>;

	#_stop_countdown() {
		clearInterval(this.#_emit_listener);
		this.#_emit_listener = undefined;
	}

	#_start_countdown() {
		if (this.#_emit_listener !== undefined || !this.#_events.rate_limit.length || !this.rate_limit.reset) return;
		const timer = setInterval(() => {
			const data = this.rate_limit;
			if (data.reset === 0) this.#_stop_countdown();
			this.#_rate_limit_send(data);
		}, 1000);
		this.#_emit_listener = timer;
		if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
	}

	#_rate_limit_send(data: RateLimitData) {
		this.#_events.rate_limit.forEach((cb) => {
			cb({ ...data });
		});
	}

	constructor(opts: AniQLOptions = {}) {
		this.#_opts = opts;
	}

	async query<R extends QueryGenqlSelection>(
		request: R & { __name?: string },
		opts?: AniQLRequestOptions,
	): Promise<FieldsSelection<Query, R>> {
		const operation = _make_query(request);
		return this.#_fetcher(opts)(operation);
	}

	async mutation<R extends MutationGenqlSelection>(
		request: R & { __name?: string },
		opts?: AniQLRequestOptions,
	): Promise<FieldsSelection<Mutation, R>> {
		const operation = _make_mutation(request);
		return this.#_fetcher(opts)(operation);
	}

	make_query = <R extends QueryGenqlSelection>(request: R & { __name?: string }) => request;
	make_mutation = <R extends MutationGenqlSelection>(request: R & { __name?: string }) => request;

	#_fetcher(opts?: AniQLRequestOptions) {
		return createFetcher({
			fetcher: async (operation) => {
				const signal = opts?.signal ?? this.#_opts.signal;
				signal?.throwIfAborted();
				const token = opts?.token ?? (await this.#_opts.get_token?.()) ?? this.#_opts.token;
				const res = await fetch(AniQLClient.base_url, {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify(operation),
					signal,
				});

				const limit = res.headers.get('x-ratelimit-limit');
				const remaining = res.headers.get('x-ratelimit-remaining');
				const limited = res.status === 429;
				if (
					limited ||
					limit !== null ||
					remaining !== null ||
					res.headers.has('x-ratelimit-reset') ||
					res.headers.has('retry-after')
				) {
					this.#_stop_countdown();
					this.#_rate_limit = {
						limit: Number.parseInt(limit ?? '', 10) || 0,
						remaining: Number.parseInt(remaining ?? '', 10) || 0,
						deadline: reset_deadline(res.headers, Date.now(), limited || remaining === '0'),
					};
					this.#_start_countdown();
					this.#_rate_limit_send(this.rate_limit);
				}
				if (limited) throw new AniQLClientError(429, 'Rate limit exceeded');

				return await res.json();
			},
		});
	}

	get auth_url() {
		const auth = this.#_opts.auth;
		if (!auth) throw new AniQLClientError(400, 'OAuth configuration is required to get an authorization URL');
		const url = new URL('https://anilist.co/api/v2/oauth/authorize');
		url.searchParams.append('client_id', auth.client_id.toString());
		url.searchParams.append('response_type', auth.response_type);
		if (auth.response_type === 'code') url.searchParams.append('redirect_uri', auth.redirect_uri);
		return url.toString();
	}

	async auth_exchange(code: string) {
		const auth = this.#_opts.auth;
		if (auth?.response_type !== 'code')
			throw new AniQLClientError(400, 'auth_exchange is only valid for response_type "code"');
		const res = await fetch('https://anilist.co/api/v2/oauth/token', {
			method: 'POST',
			signal: this.#_opts.signal,
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

export {
	everything,
	type FieldsSelection,
	GenqlError,
	type GraphqlOperation,
	generateGraphqlOperation,
} from './genql/runtime/index.ts';
export * from './genql/schema.ts';
