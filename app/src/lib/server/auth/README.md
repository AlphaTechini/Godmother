# auth: optional accounts

Email and password accounts. Login is never required: guests use the app as before, and signing in keeps sessions with an account across devices. Accounts switch on when both `DATABASE_URL` and `AUTH_SECRET` (at least 32 characters) are set.

## Decisions and tradeoffs

- **Built here instead of using Supabase Auth.** The database stays a plain Postgres host that can be swapped. The tradeoff is owning this code, including its security.
- **Argon2id at the OWASP minimum settings** (19 MiB, 2 passes, 1 thread) through `@node-rs/argon2`. Unknown emails still run a verification, so timing doesn't reveal which accounts exist.
- **A signed cookie, plus a revocation record.** The cookie is an HMAC-signed record, so it can still be checked while the database is down. People stay signed in through an outage. Sign-out adds a database record, checked at most once a minute per login. So a sign-out can take up to a minute to reach another server, and one made during an outage is only known to the server that handled it, though the browser's cookie is deleted either way.
- **New logins need the database.** Sign-up, sign-in and reset answer with a clear message during an outage, and the app stays usable as a guest.
- **Email is confirmed with a 6-digit code at sign-up.** The account can't sign in until then. A code lasts 15 minutes and allows 5 guesses, because six digits are easy to guess at, and only a keyed hash is stored. A code is simpler than a link because it works when the email is opened on another device. Signing up again with an unconfirmed address replaces its password and code, so a stranger can't hold someone's address. A password reset also confirms the address, since the link reached the inbox.
- **Rate limits count per browser and per address.** The browser holds a signed id in an httpOnly cookie, so a new IP doesn't reset its count, and clearing the cookie doesn't reset the address count. Requests with no genuine id share one allowance. A script can fetch a new id each time, but it can't fake its address, because the API only answers requests that came through Cloudflare (see [edge.ts](edge.ts)).
- **Rate limits live in memory.** They reset on restart and aren't shared between servers. That's enough for one server, and a shared store is the upgrade if the app grows.
- **Access rule:** a session with no owner opens with its private link, and one with an owner opens only for that account. Images follow their session. Claiming a guest session into an account relies on knowing its link, the same thing that grants access to it.

## Where things are

To find password hashing visit [password.ts](password.ts).

To find cookie signing and checking visit [cookie.ts](cookie.ts).

To find rate limiting visit [limiter.ts](limiter.ts).

To find the per-browser and per-address limits visit [client-limit.ts](client-limit.ts).

To find the browser id visit [device.ts](device.ts).

To find email codes visit [verification.ts](verification.ts).

To find the proof that a request came through Cloudflare visit [edge.ts](edge.ts).

To find the access rule and the current user visit [index.ts](index.ts).

To find what the account routes share visit [routes.ts](routes.ts).

The users, logins and password resets tables are reached through [accounts.ts](accounts.ts).

The request hook that sets the current user can be found in [hooks.server.ts](../../../hooks.server.ts).
