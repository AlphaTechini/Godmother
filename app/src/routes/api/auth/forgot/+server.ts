import { json } from '@sveltejs/kit';
import { accountsEnabled } from '#lib/server/auth';
import { createPasswordReset, findUser, normalizeEmail } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import { allowAttempt } from '#lib/server/auth/limiter';
import { accountsOff, emailProblem, readBody, tooMany } from '#lib/server/auth/routes';
import { config } from '#lib/server/config';
import { emailEnabled, sendEmail } from '#lib/server/email';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request, url } = event;
	if (!accountsEnabled() || !emailEnabled()) return accountsOff();
	const { email } = await readBody(request);
	const problem = emailProblem(email);
	if (problem) return json({ error: problem }, { status: 400 });
	const address = normalizeEmail(email as string);
	if (!allowClient(event, 'forgot', 10, 60 * 60_000)) return tooMany();

	// The same answer whether or not the account exists, so this can't be used to find accounts.
	const answer = json({ ok: true });
	if (!allowAttempt(`forgot:${address}`, 3, 60 * 60_000)) return answer;
	try {
		const user = await findUser(address);
		if (user) {
			const token = await createPasswordReset(user.id);
			const link = `${config.appUrl ?? url.origin}/account/reset?token=${encodeURIComponent(token)}`;
			await sendEmail({
				to: user.email,
				subject: 'Reset your Godmother password',
				text: `Use this link to choose a new password. It works once and expires in an hour.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
				html: `<p>Use this link to choose a new password. It works once and expires in an hour.</p><p><a href="${link}">Choose a new password</a></p><p>If you didn't ask for this, you can ignore this email.</p>`
			});
		}
	} catch (err) {
		console.error('[auth] password reset email failed', err);
	}
	return answer;
};
