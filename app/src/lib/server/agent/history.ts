// Rebuilds the model input from the session each turn: recent chat as text, the current message with its attachments.

import { assetInputPart, type InputMessage, type InputPart } from '#lib/server/llm';
import type { Attachment, Block, ChatMessage } from '#lib/types';

export const HISTORY_MESSAGES = 20;

export function attachmentLine(a: Attachment): string {
	return `[attachment asset=${a.asset.id} purpose=${a.purpose}]`;
}

const BLOCK_WORDS: Partial<Record<Block['type'], string>> = {
	event: 'event card',
	photo_request: 'photo request',
	wardrobe: 'wardrobe card',
	products: 'product cards',
	sew_design: 'sew design card',
	looks: 'look cards',
	decision: 'decision card',
	face_profile: 'face profile card',
	lookbook: 'lookbook',
	shopping_list: 'shopping list'
};

/** A message as plain text, with a note for the cards and attachments it carried. */
export function messageText(m: ChatMessage): string {
	const lines: string[] = [];
	if (m.text.trim()) lines.push(m.text.trim());
	for (const a of m.attachments) lines.push(attachmentLine(a));
	const cards = [
		...new Set(m.blocks.map((b) => BLOCK_WORDS[b.type]).filter((w): w is string => Boolean(w)))
	];
	if (cards.length) lines.push(`[cards shown: ${cards.join(', ')}]`);
	return lines.join('\n');
}

/** Recent chat before the current exchange, oldest first. Older attachments are only text lines. */
export function historyItems(
	messages: readonly ChatMessage[],
	currentIds: readonly string[],
	limit = HISTORY_MESSAGES
): InputMessage[] {
	const out: InputMessage[] = [];
	const past = messages.filter((m) => !currentIds.includes(m.id));
	for (const m of past.slice(-limit)) {
		const text = messageText(m);
		if (!text) continue;
		out.push({ role: m.role, content: text });
	}
	return out;
}

/** The current user message: its text, one text line per attachment followed by the attachment itself. */
export async function currentUserItem(
	message: ChatMessage,
	text: string,
	uiLines: readonly string[]
): Promise<InputMessage> {
	const content: InputPart[] = [];
	if (text.trim()) content.push({ type: 'text', text: text.trim() });
	else if (message.attachments.length > 0)
		content.push({ type: 'text', text: '(no text, attachments only)' });
	for (const a of message.attachments) {
		content.push({ type: 'text', text: attachmentLine(a) });
		const part = await assetInputPart(a.asset.id, {
			detail: a.purpose === 'invitation' ? 'high' : 'low',
			filename: a.asset.label
		});
		if (part) content.push(part);
		else content.push({ type: 'text', text: `[asset ${a.asset.id} could not be shown to you]` });
	}
	for (const line of uiLines) content.push({ type: 'text', text: line });
	if (content.length === 0) content.push({ type: 'text', text: '(empty message)' });
	return { role: 'user', content };
}
