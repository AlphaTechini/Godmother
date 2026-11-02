# scripts

Developer scripts for the database.

**Decisions and tradeoffs:** Run through `pnpm` with `tsx`, so they share the app's types.

## Files

- [db-migrate.ts](db-migrate.ts): Applies db/migrations/*.sql in name order, each once.

## Where to look


To find the db-migrate logic visit [db-migrate.ts](db-migrate.ts).

