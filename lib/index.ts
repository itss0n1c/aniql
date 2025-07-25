import type { FieldsSelection, Mutation, MutationGenqlSelection, Query, QueryGenqlSelection } from './genql';
import { type ClientOptions, createFetcher, generateGraphqlOperation, linkTypeMap } from './genql/runtime';
import types from './genql/types';

/** Represents a value that can be awaited. */
type Awaitable<T> = Promise<T> | T;

/** A utility type to make an object type more readable by removing excess properties. */
type Prettify<T> = T extends object ? { [K in keyof T]: Prettify<T[K]> } & {} : T;

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

type AniQLAuth = Prettify<AniQLAuthResCode | AniQLAuthResToken>;

/** Options for the AniQL client. */
type AniQLOptions = ClientOptions & {
	auth: AniQLAuth;
	get_token?: () => Awaitable<string | undefined>;
};

/** Options for the request made by the AniQL client. */
type RequestOptions = { token?: string };

/**
 * AniQLClient is a client for interacting with the AniList GraphQL API.
 * It allows you to perform queries and mutations against the AniList API.
 * You can also get the login URL to authenticate users.
 *
 * The client will automatically include the token, if provided via options, in the Authorization header for requests.
 *
 * For documentation on the AniList API, see https://docs.anilist.co/
 */

const typeMap = linkTypeMap(types as any);
const typeMapQuery = typeMap.Query;
const typeMapMutation = typeMap.Mutation;
if (!typeMapQuery || !typeMapMutation) throw new Error('Query or Mutation root is missing in type map');

const _make_query = <R extends QueryGenqlSelection>(request: R & { __name?: string }) =>
	generateGraphqlOperation('query', typeMapQuery, request as any);
const _make_mutation = <R extends QueryGenqlSelection>(request: R & { __name?: string }) =>
	generateGraphqlOperation('mutation', typeMapMutation, request as any);

class AniQLClient {
	_opts: AniQLOptions;
	static base_url = 'https://graphql.anilist.co';

	constructor(opts: AniQLOptions) {
		this._opts = opts;
	}

	query<R extends QueryGenqlSelection>(request: R & { __name?: string }, opts?: RequestOptions) {
		const operation = _make_query(request);
		return this._fetcher(opts?.token)(operation) as Promise<Prettify<FieldsSelection<Query, R>>>;
	}

	mutation<R extends MutationGenqlSelection>(request: R & { __name?: string }, opts?: RequestOptions) {
		const operation = _make_mutation(request);
		return this._fetcher(opts?.token)(operation) as Promise<Prettify<FieldsSelection<Mutation, R>>>;
	}

	_fetcher(_token?: string) {
		return createFetcher({
			fetcher: async (operation) => {
				const token = _token ?? (await this._opts?.get_token?.());
				const res = await fetch(AniQLClient.base_url, {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify(operation),
				});
				return await res.json();
			},
		});
	}

	get auth_url() {
		const auth = this._opts.auth;
		const url = new URL('https://anilist.co/api/v2/oauth/authorize');
		url.searchParams.append('client_id', auth.client_id.toString());
		url.searchParams.append('response_type', auth.response_type);
		if (auth.response_type === 'code') url.searchParams.append('redirect_uri', auth.redirect_uri);
		return url.toString();
	}

	async auth_exchange(code: string) {
		const auth = this._opts.auth;
		if (auth.response_type !== 'code') throw new Error('auth_exchange is only valid for response_type "code"');
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
		if (!res.ok) throw new Error(`Failed to exchange code: ${res.status} ${res.statusText}`);
		return res.json() as Promise<{
			access_token: string;
			token_type: string;
			expires_in: number;
			refresh_token: string;
		}>;
	}
}

export * from './genql';
export { AniQLClient, type AniQLOptions, type Awaitable, type Prettify, type RequestOptions };

