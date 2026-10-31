# units: YouCam unit allowances

Limits what one person can spend across all their sessions.

## Decisions and tradeoffs

- **Guests get one grant for good, 50 units by default.** It is tracked against the browser and the address together, and spending stops when either runs out. Clearing cookies doesn't help while the address is the same, and changing address doesn't help while the browser keeps its id. The tradeoff is that people sharing an address, such as on a mobile carrier or at a venue, share one guest grant. They can sign in for their own. `GUEST_UNITS` changes the amount.
- **Signed-in users get 60 units and can claim a fresh grant once per UTC day, only by asking.** Until they claim, they keep spending what they have. A claim resets the balance to a full grant, so unused units don't stack. `USER_UNITS` changes the amount.
- **The database holds balances, and memory holds what is reserved.** Reservations are synchronous, so parallel renders and parallel sessions can't overspend. This relies on the API running as a single instance. More instances would need reservations in the database.
- **During a database outage the app stays usable,** working from what's in memory. An identity it hasn't seen since it started gets a fresh grant until the database returns. That is a small, short-lived cost risk, chosen over blocking everyone.
- **Addresses are stored as keyed hashes,** never in plain form.
- **Accounts need a confirmed email.** A new account gets its 60 units only after entering the code sent to the address, and sign-ups are limited to 5 a day per browser and per address. Someone with many real inboxes or email aliases can still make more accounts.

## Where things are

To find balances, spending and claims visit [wallets.ts](wallets.ts).

To find how spending checks a balance visit [ledger.ts](../youcam/ledger.ts).

The balances table can be found in [002_unit_wallets.sql](../../../../db/migrations/002_unit_wallets.sql).

To find the claim endpoint visit [+server.ts](../../../routes/api/account/units/+server.ts).
