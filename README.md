# aniql

### A library for interacting with the AniList API.

<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/v/aniql?maxAge=600" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/dt/aniql.svg?maxAge=600" alt="npm downloads" /></a>

### Documentation live at https://s0n1c.ca/aniql

## Installation

```zsh
% bun i aniql
```

## Usage

`aniql` is ESM-only and works in Bun, modern Node.js, and browsers with `fetch`.

```ts
import { AniQLClient } from 'aniql';

const client = new AniQLClient(); // `new AniQLClient({ client_id: 123 })` also works

const user = await client.query({
	User: {
		__args: { name: 'itss0n1c' },
		id: true,
		name: true,
		avatar: {
			large: true,
			medium: true,
		},
	},
});
console.log(user.User);
```

Public AniList queries don't require OAuth or send a client ID. If you already
have an access token, use `new AniQLClient({ token: accessToken })`, or provide
`get_token: () => accessToken` if it can change. Pass `{ token }` as the second
argument to `query` or `mutation` to override the client token for one request.
Both the client and individual requests accept an `AbortSignal` via `signal`.

Set `auth` only if you use `auth_url` or `auth_exchange`. For OAuth code
exchange, keep the client secret on your server.

## Note

This library is not affiliated with AniList, and is not an official AniList library.
For more information, see the AniList API documentation at https://docs.anilist.co/
