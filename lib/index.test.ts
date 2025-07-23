import { test } from 'bun:test';
import { AniQLClient } from '.';

const client_id = Number.parseInt(Bun.env.CLIENT_ID ?? '');

const client = new AniQLClient(client_id, { get_token: () => Bun.env.TOKEN });

test('test:viewer', async () => {
	const res = await client.query({
		Viewer: {
			id: true,
			name: true,
			avatar: {
				large: true,
				medium: true,
			},
			options: {
				__scalar: true,
			},
		},
	});
	console.log(res.Viewer);
});

test('test:user', async () => {
	const res = await client.query({
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
	console.log(res.User);
});
