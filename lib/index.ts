import {
	type Client,
	createClient,
	type Mutation,
	type MutationGenqlSelection,
	type Query,
	type QueryGenqlSelection,
} from './genql';
import type { ClientOptions, FieldsSelection } from './genql/runtime';

/** Represents a value that can be awaited. */
type Awaitable<T> = Promise<T> | T;

/** A utility type to make an object type more readable by removing excess properties. */
type Prettify<T> = T extends object ? { [K in keyof T]: Prettify<T[K]> } & {} : T;
/** Options for the AniQL client. */
type AniQLOptions = ClientOptions & { get_token?: () => Awaitable<string | undefined> };

/**
 * AniQLClient is a client for interacting with the AniList GraphQL API.
 * It allows you to perform queries and mutations against the AniList API.
 * You can also get the login URL to authenticate users.
 *
 * The client will automatically include the token, if provided via options, in the Authorization header for requests.
 *
 * For documentation on the AniList API, see https://docs.anilist.co/
 */
class AniQLClient {
	client_id: number;
	#_client: Client;

	static base_url = 'https://graphql.anilist.co';

	constructor(client_id: number, opts?: AniQLOptions) {
		const obj = createClient({
			...opts,
			fetcher: async (operation) => {
				const token = await opts?.get_token?.();
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
		this.client_id = client_id;
		this.#_client = obj;
	}

	async query<R extends QueryGenqlSelection>(request: R & { __name?: string }) {
		const res = await this.#_client.query(request);
		return res as Prettify<FieldsSelection<Query, R>>;
	}

	async mutation<R extends MutationGenqlSelection>(request: R & { __name?: string }) {
		const res = await this.#_client.mutation(request);
		return res as Prettify<FieldsSelection<Mutation, R>>;
	}

	login_url() {
		const url = new URL('https://anilist.co/api/v2/oauth/authorize');
		url.searchParams.append('client_id', this.client_id.toString());
		url.searchParams.append('response_type', 'token');
		return url.toString();
	}
}

export * from './genql';
export { AniQLClient, type AniQLOptions, type Awaitable, type Prettify };

