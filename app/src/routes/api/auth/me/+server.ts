import { json } from '@sveltejs/kit';
import { accountsEnabled } from '#lib/server/auth';
import { emailEnabled } from '#lib/server/email';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) =>
	json({
		accounts: accountsEnabled(),
		passwordReset: accountsEnabled() && emailEnabled(),
		user: locals.user ? { email: locals.user.email } : null
	});
