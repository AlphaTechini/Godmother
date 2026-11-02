# client

Browser-side state and API calls.

**Decisions and tradeoffs:** Session state lives here rather than in components, so a dropped stream can reattach without losing the page.

## Files

- [account.ts](account.ts): The browser's side of accounts.
- [api.ts](api.ts): HTTP client for the Godmother API (see docs/ARCHITECTURE.md).
- [fixtures.ts](fixtures.ts): Realistic, fully typed fixtures for every stage of a Godmother session.
- [format.ts](format.ts): Display helpers shared by components.
- [markdown.ts](markdown.ts): A deliberately small, safe markdown renderer for assistant messages.
- [mock.svelte.ts](mock.svelte.ts): A purely client-side Transport for /studio/mock.
- [retry.ts](retry.ts): Retries for requests that are safe to repeat.
- [session.svelte.ts](session.svelte.ts): Browser-side session state.
- [studio.svelte.ts](studio.svelte.ts): View state for one open studio (which canvas section is showing, the mobile tab, the composer draft).
- [theme.svelte.ts](theme.svelte.ts): Evening / Daylight theme.

## Where to look

To find the account logic visit [account.ts](account.ts).

To find the api logic visit [api.ts](api.ts).

To find the fixtures logic visit [fixtures.ts](fixtures.ts).

To find the format logic visit [format.ts](format.ts).

To find the markdown logic visit [markdown.ts](markdown.ts).

To find the mock logic visit [mock.svelte.ts](mock.svelte.ts).

To find the retry logic visit [retry.ts](retry.ts).

To find the session logic visit [session.svelte.ts](session.svelte.ts).

To find the studio logic visit [studio.svelte.ts](studio.svelte.ts).

To find the theme logic visit [theme.svelte.ts](theme.svelte.ts).
