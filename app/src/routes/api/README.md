# api

The HTTP API. The full table is in [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md).

**Decisions and tradeoffs:** One folder per route, as SvelteKit requires. Each handler stays thin and calls into `lib/server`.

## Folders

- [account](account/README.md)
- [assets](assets/README.md)
- [auth](auth/README.md)
- [health](health/README.md)
- [sessions](sessions/README.md)
