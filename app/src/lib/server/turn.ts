// The contract between the messages route and whatever runs a turn (the live agent or the demo player).

import type {
	Attachment,
	Block,
	ChatMessage,
	Session,
	SessionSnapshot,
	StreamEvent,
	UserAction
} from '#lib/types';

export interface TurnInput {
	text: string;
	attachments: Attachment[];
	action?: UserAction;
}

export interface TurnContext {
	/** Mutable. The route persists it after the turn; call `sessionChanged()` to persist and push a snapshot mid-turn. */
	session: Session;
	userMessage: ChatMessage;
	/** Already pushed onto session.messages. The helpers below mutate it. */
	assistantMessage: ChatMessage;
	/** Appends to assistantMessage.text and emits text_delta. */
	text(delta: string): void;
	/** Appends to assistantMessage.blocks and emits block. */
	block(block: Block): void;
	/** Emits an activity frame (progress line). Re-use the id to update it. */
	activity(id: string, label: string, status: 'running' | 'done' | 'failed', detail?: string): void;
	/** Persists the session and emits a session snapshot. */
	sessionChanged(): Promise<void>;
	/** Low-level escape hatch; prefer the helpers. */
	emit(event: StreamEvent): void;
}

/** Runs one turn. Must not throw for expected failures; emit an error block instead. */
export type TurnRunner = (ctx: TurnContext, input: TurnInput) => Promise<void>;

export function snapshot(session: Session): SessionSnapshot {
	const { messages: _messages, taskJournal: _journal, ...rest } = session;
	return structuredClone(rest);
}

/** The session as the browser may see it. */
export function publicSession(session: Session): Omit<Session, 'taskJournal'> {
	const { taskJournal: _journal, ...rest } = session;
	return structuredClone(rest);
}
