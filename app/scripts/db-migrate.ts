// Applies db/migrations/*.sql in name order, each once. Run: pnpm db:migrate

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { closeDb, dbEnabled, query } from '#lib/server/db';

const dir = resolve('db/migrations');

if (!dbEnabled()) {
	console.error('DATABASE_URL is not set in app/.env.');
	process.exit(1);
}

await query(
	'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())'
);
await query('alter table schema_migrations enable row level security');
const applied = new Set(
	(await query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name)
);

for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
	if (applied.has(name)) {
		console.log(`already applied  ${name}`);
		continue;
	}
	await query(await readFile(join(dir, name), 'utf8'));
	await query('insert into schema_migrations (name) values ($1)', [name]);
	console.log(`applied          ${name}`);
}
await closeDb();
