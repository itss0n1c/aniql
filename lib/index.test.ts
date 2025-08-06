import { test } from 'bun:test';
import { AniQLClient, type UserGenqlSelection } from '.';

const client_id = Number.parseInt(Bun.env.CLIENT_ID ?? '');

const client = new AniQLClient({
	auth: {
		response_type: 'token',
		client_id,
	},
	get_token: () => Bun.env.TOKEN,
});

test('rate_limit', async () => {
	client.on('rate_limit', (data) => {
		console.log(`Rate limit: ${data.limit}, Remaining: ${data.remaining}, Reset in: ${data.reset} seconds`);
	});

	const query = client.make_query({ Viewer: { id: true } });
	for await (const _ of Array.from({ length: 100 })) {
		await client.query(query);
	}
});

const user_selection = {
	id: true,
	name: true,
	avatar: {
		large: true,
		medium: true,
	},
} satisfies UserGenqlSelection;

test('user:current', async () => {
	const res = await client.query({ Viewer: user_selection });
	console.log(res.Viewer);
});

test('user:other', async () => {
	const res = await client.query({
		User: {
			__args: { name: 'itss0n1c' },
			...user_selection,
		},
	});
	console.log(res.User);
});
