# scripts

Developer scripts for the database and the demo fixture.

**Decisions and tradeoffs:** Run through `pnpm` with `tsx`, so they share the app's types.

## Files

- [build-demo-script.ts](build-demo-script.ts): Generates app/demo/script.json (the illustrated demo) from the UI fixtures.
- [db-migrate.ts](db-migrate.ts): Applies db/migrations/*.sql in name order, each once.
- [export-demo.ts](export-demo.ts): Turns a recorded live session into the demo fixture.

## Where to look

To find the build-demo-script logic visit [build-demo-script.ts](build-demo-script.ts).

To find the db-migrate logic visit [db-migrate.ts](db-migrate.ts).

To find the export-demo logic visit [export-demo.ts](export-demo.ts).
