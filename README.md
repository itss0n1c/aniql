# aniql

### A library for interacting with the AniList API.

<a href="https://discord.gg/bMFPpxtMTe"><img src="https://img.shields.io/discord/977286501756968971?color=5865F2&logo=discord&logoColor=white" alt="Discord server" /></a>
<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/v/aniql?maxAge=3600" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/aniql"><img src="https://img.shields.io/npm/dt/aniql.svg?maxAge=3600" alt="npm downloads" /></a>

### Documentation live at https://s0n1c.ca/aniql

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
    __args: { name: "itss0n1c" },
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
