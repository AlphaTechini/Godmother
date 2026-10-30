// The demo script format (app/demo/script.json) plus validation helpers.
// Shared by the player, the build script and the exporter, so it only has type-level imports.

import type { Attachment, Session, StreamEvent, UserAction } from '#lib/types';

export interface DemoEvent {
	/** Milliseconds from the start of the turn. */
	at: number;
	event: StreamEvent;
}

export interface DemoTurn {
	/** The scripted user message: what the suggestion chip (or button) sends. */
	user: { text: string; attachments: Attachment[]; action?: UserAction };
	/** Message ids are placeholders; the player maps text and blocks onto the live assistant message. */
	events: DemoEvent[];
}

export interface DemoScript {
	version: 1;
	title: string;
	/** Merged into the new demo session (greeting message with a suggestions block, stage). */
	initial: Partial<Session>;
	turns: DemoTurn[];
}

const EVENT_TYPES = ['message', 'text_delta', 'block', 'activity', 'session', 'error', 'done'];

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural check of a parsed script.json. Throws an Error describing the first problem. */
export function parseDemoScript(raw: unknown): DemoScript {
	if (!isRecord(raw)) throw new Error('Demo script must be a JSON object.');
	if (raw.version !== 1) throw new Error(`Unsupported demo script version: ${String(raw.version)}.`);
	if (typeof raw.title !== 'string') throw new Error('Demo script "title" must be a string.');
	if (!isRecord(raw.initial)) throw new Error('Demo script "initial" must be an object.');
	if (!Array.isArray(raw.turns)) throw new Error('Demo script "turns" must be an array.');
	raw.turns.forEach((turn, i) => {
		if (!isRecord(turn)) throw new Error(`turns[${i}] must be an object.`);
		const user = turn.user;
		if (!isRecord(user) || typeof user.text !== 'string') {
			throw new Error(`turns[${i}].user.text must be a string.`);
		}
		if (!Array.isArray(user.attachments)) {
			throw new Error(`turns[${i}].user.attachments must be an array.`);
		}
		if (!Array.isArray(turn.events)) throw new Error(`turns[${i}].events must be an array.`);
		let last = 0;
		turn.events.forEach((e, j) => {
			if (!isRecord(e) || typeof e.at !== 'number' || !Number.isFinite(e.at) || e.at < 0) {
				throw new Error(`turns[${i}].events[${j}].at must be a non-negative number.`);
			}
			if (e.at < last) throw new Error(`turns[${i}].events[${j}] is out of order.`);
			last = e.at;
			const ev = e.event;
			if (!isRecord(ev) || typeof ev.type !== 'string' || !EVENT_TYPES.includes(ev.type)) {
				throw new Error(`turns[${i}].events[${j}].event has an unknown type.`);
			}
		});
	});
	return raw as unknown as DemoScript;
}

/** Lower-case letters and digits only, so "Decide for me." equals "Decide for me". */
export function normalizeLabel(text: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Default button label for an action, used when a recorded action turn has no text. */
export function actionLabel(action: UserAction): string {
	switch (action.type) {
		case 'decide_for_me':
			return 'Decide for me';
		case 'choose_look':
			return 'I’ll wear this look';
		case 'finish_look':
			return 'Finish this look';
		case 'shopping_list':
			return 'Build my shopping list';
	}
}

/** The suggestions options of the last block event of a turn, or null if it does not end with one. */
export function finalSuggestions(turn: DemoTurn): string[] | null {
	for (let i = turn.events.length - 1; i >= 0; i--) {
		const ev = turn.events[i].event;
		if (ev.type === 'block') return ev.block.type === 'suggestions' ? ev.block.options : null;
	}
	return null;
}

/** Playback length of a turn in ms, with waits capped like the player does. */
export function turnDurationMs(turn: DemoTurn, maxWaitMs = 4000, speed = 1): number {
	let elapsed = 0;
	let total = 0;
	for (const { at } of turn.events) {
		total += Math.min(Math.max(0, at - elapsed) / speed, maxWaitMs);
		elapsed = at;
	}
	return total;
}

/**
 * Problems with the story chain: every turn must end with a suggestions block whose first
 * option is exactly the next turn's user.text, and the greeting must lead into turn 0.
 */
export function checkSuggestionChain(script: DemoScript): string[] {
	const problems: string[] = [];
	const greeting = script.initial.messages?.at(-1);
	const first = greeting?.blocks.findLast((b) => b.type === 'suggestions');
	if (script.turns.length > 0) {
		if (!first || first.type !== 'suggestions' || first.options[0] !== script.turns[0].user.text) {
			problems.push('initial: the greeting must end with suggestions whose first option is turn 0 text.');
		}
	}
	script.turns.forEach((turn, i) => {
		const options = finalSuggestions(turn);
		if (!options || options.length === 0) {
			problems.push(`turn ${i}: the final block must be a suggestions block.`);
			return;
		}
		const next = script.turns[i + 1];
		if (next && options[0] !== next.user.text) {
			problems.push(
				`turn ${i}: first suggestion ${JSON.stringify(options[0])} must equal turn ${i + 1} text ${JSON.stringify(next.user.text)}.`
			);
		}
	});
	return problems;
}
