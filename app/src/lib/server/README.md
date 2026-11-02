# server

Everything that must never reach the browser, and the code that runs one turn.

**Decisions and tradeoffs:** A turn runs apart from its request, so a dropped connection doesn't stop paid work. In-memory turns assume one server, which is why Cloud Run is capped at one instance.

## Files

- [config.ts](config.ts): The only place that reads process.env.
- [runner.ts](runner.ts): Executes one user turn for POST /api/sessions/:id/messages.
- [sse.ts](sse.ts): Server-sent events plumbing for one turn.
- [turn-hub.ts](turn-hub.ts): Turns in progress.
- [turn-recovery.ts](turn-recovery.ts): What happens to a turn that stopped before it finished.
- [turn.ts](turn.ts): The contract between the messages route and whatever runs a turn (the live agent).

## Where to look

To find the config logic visit [config.ts](config.ts).

To find the runner logic visit [runner.ts](runner.ts).

To find the sse logic visit [sse.ts](sse.ts).

To find the turn-hub logic visit [turn-hub.ts](turn-hub.ts).

To find the turn-recovery logic visit [turn-recovery.ts](turn-recovery.ts).

To find the turn logic visit [turn.ts](turn.ts).

## Folders

- [agent](agent/README.md)
- [auth](auth/README.md)
- [db](db/README.md)
- [email](email/README.md)
- [images](images/README.md)
- [llm](llm/README.md)
- [shop](shop/README.md)
- [store](store/README.md)
- [units](units/README.md)
- [youcam](youcam/README.md)
