# db: the Postgres connection

Everything that talks to the database goes through [index.ts](index.ts). It uses the standard `pg` driver and plain SQL, so moving off Supabase means changing `DATABASE_URL` and nothing else.

## Decisions and tradeoffs

- **The database is optional.** With no `DATABASE_URL` the app works exactly as it does on local disk alone. `dbEnabled()` is the switch every caller checks.
- **Connect through Supabase's Session pooler.** The direct host is IPv6 only on the free tier. The pooler works on IPv4 and takes `sslmode=require`.
- **`sslmode=require` encrypts but does not verify the server,** which is what that mode means in Postgres. Set `DATABASE_CA_CERT` to verify the certificate as well. The tradeoff is one more setting to maintain, so it stays optional.
- **Short connection timeout (5 seconds).** Callers run in the background or fall back to local data, so a slow failure is worse than a quick one.
- **Row level security is on, with no policies.** Supabase exposes tables through a public REST API. With this setting that API sees nothing, and only the server's direct connection can read them.

## Where things are

To find the connection, queries and transactions visit [index.ts](index.ts).

The database schema can be found in [001_init.sql](../../../../db/migrations/001_init.sql).

The migration runner can be found in [db-migrate.ts](../../../../scripts/db-migrate.ts).
