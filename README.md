# aniql

### A library for interacting with the AniList API.

<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/v/aniql?maxAge=600" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/dt/aniql.svg?maxAge=600" alt="npm downloads" /></a>

### Documentation live at https://warsame.me/aniql

## Installation

```zsh
% bun i aniql
```

## Usage

`aniql` is available via server-side (Bun & Node.js), as well as in browser.

```ts
import { AniQLClient } from "aniql";

const client = new AniQLClient({
  token: Bun.env.TOKEN,
});

const user = await client.query({
  User: {
    __args: { name: "warsame" },
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

## Note

This library is not affiliated with AniList, and is not an official AniList library.
For more information, see the AniList API documentation at https://docs.anilist.co/
