# account

The `/api/account` route.

**Decisions and tradeoffs:** A thin handler: it checks the request and calls into `lib/server`, where the logic and its tests live.

## Folders

- [claim](claim/README.md)
- [sessions](sessions/README.md)
- [units](units/README.md)
