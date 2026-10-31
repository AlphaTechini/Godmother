# email: sending email

One function, `sendEmail`, used for password reset links.

## Decisions and tradeoffs

- **Resend over plain HTTP, without its SDK.** One POST request is all this needs, so a dependency adds nothing. Changing provider means replacing this one file. The tradeoff is handling the response by hand.
- **Optional.** Without `RESEND_API_KEY` and `EMAIL_FROM`, password reset is switched off and its link is hidden. Everything else about accounts still works.
- **A verified domain is needed to reach real users.** Resend's test sender, `onboarding@resend.dev`, only delivers to the address on the Resend account.

## Where things are

The Resend connection can be found in [index.ts](index.ts).

To find the password reset email visit [forgot/+server.ts](../../../routes/api/auth/forgot/+server.ts).
