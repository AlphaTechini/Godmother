# db: database migrations

Plain SQL files, applied in name order by `pnpm db:migrate`. Each runs once, and `schema_migrations` records what has run.

## Decisions and tradeoffs

- **Plain SQL rather than an ORM.** The schema is small, and plain SQL runs on any Postgres host. The tradeoff is that there are no generated types, so query results are typed by hand.
- **Session data stays as JSON.** The `sessions.data` column holds the same document the app saves to disk, and only the columns needed for listing are pulled out. That avoids a table per feature, but the database can't easily answer questions about what's inside a session.
- **Migrations only move forward.** To change something, add a new numbered file. Never edit one that has already run.

## Where things are

The schema can be found in [migrations/001_init.sql](migrations/001_init.sql).

To find the code that applies migrations visit [db-migrate.ts](../scripts/db-migrate.ts).
