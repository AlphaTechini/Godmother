// Sending email through Resend's HTTP API. Changing provider means replacing this one file.

import { config } from '#lib/server/config';

export interface Email {
	to: string;
	subject: string;
	text: string;
	html: string;
}

export function emailEnabled(): boolean {
	return Boolean(config.email.apiKey && config.email.from);
}

export async function sendEmail(email: Email): Promise<void> {
	if (!config.email.apiKey || !config.email.from) throw new Error('Email is not configured.');
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${config.email.apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ from: config.email.from, ...email }),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok)
		throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
