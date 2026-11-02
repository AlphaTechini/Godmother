# auth

The `/api/auth` route.

**Decisions and tradeoffs:** A thin handler: it checks the request and calls into `lib/server`, where the logic and its tests live.

## Folders

- [forgot](forgot/README.md)
- [login](login/README.md)
- [logout](logout/README.md)
- [me](me/README.md)
- [resend](resend/README.md)
- [reset](reset/README.md)
- [signup](signup/README.md)
- [verify](verify/README.md)
