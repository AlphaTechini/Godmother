// The Postgres connection. Standard driver and plain SQL only, so changing host means changing DATABASE_URL.

import pg from 'pg';
import { config } from '#lib/server/config';

let pool: pg.Pool | null = null;

/**
 * sslmode=require encrypts the connection. Without DATABASE_CA_CERT it does not verify the server
 * certificate, which matches what libpq's "require" means. Set the CA to verify it as well.
 */
function createPool(url: string): pg.Pool {
	const parsed = new URL(url);
	const sslmode = parsed.searchParams.get('sslmode');
	parsed.searchParams.delete('sslmode');
	const ca = config.database.caCert;
	const created = new pg.Pool({
		connectionString: parsed.toString(),
		ssl:
			sslmode === 'disable'
				? false
				: ca
					? { ca, rejectUnauthorized: true }
					: { rejectUnauthorized: false },
		max: 5,
		connectionTimeoutMillis: 5000,
		idleTimeoutMillis: 30_000
	});
	// An idle client losing its connection during an outage must not crash the server.
	created.on('error', (err) => console.error('[db] idle connection error', err.message));
	return created;
}

export function dbEnabled(): boolean {
	return Boolean(config.database.url);
}

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params: unknown[] = []
): Promise<pg.QueryResult<R>> {
	if (!config.database.url) throw new Error('The database is not configured.');
	pool ??= createPool(config.database.url);
	return pool.query<R>(text, params);
}

/** Runs several statements as one transaction. */
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
	if (!config.database.url) throw new Error('The database is not configured.');
	pool ??= createPool(config.database.url);
	const client = await pool.connect();
	try {
		await client.query('begin');
		const result = await work(client);
		await client.query('commit');
		return result;
	} catch (err) {
		await client.query('rollback').catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}

export async function closeDb(): Promise<void> {
	await pool?.end();
	pool = null;
}
