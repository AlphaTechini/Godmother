// Demo mode: replays the scripted run in app/demo/script.json. Never calls OpenAI or YouCam.

import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '#lib/server/config';
import type { TurnContext, TurnInput, TurnRunner } from '#lib/server/turn';
import type { ChatMessage, PhotoSlot, Session, SessionSnapshot } from '#lib/types';
import { normalizeLabel, parseDemoScript, type DemoScript, type DemoTurn } from './script';

export type { DemoEvent, DemoScript, DemoTurn } from './script';

/** Playback speed: 1 is the recorded pace, 2 twice as fast. */
export const PLAYBACK_SPEED = 1;
/** No single pause between two events is longer than this (a recorded live turn can take minutes). */
export const MAX_WAIT_MS = 4000;

export const END_OF_DEMO_TEXT =
	"That's the end of the demo. Start a live session to style your own event.";
export const OFF_SCRIPT_NOTE =
	"This is a saved demo run, so I can't act on that one, but let's carry on with the story.\n\n";

const PHOTO_SLOTS: readonly PhotoSlot[] = ['fullBody', 'portrait', 'hand'];

export interface DemoPlayerOptions {
	/** Supplies the script; null when there is none. Defaults to app/demo/script.json. */
	loadScript?: () => Promise<DemoScript | null>;
	/** Waits `ms`. Tests pass an instant one. */
	sleep?: (ms: number) => Promise<void>;
	speed?: number;
	maxWaitMs?: number;
}

/* ------------------------------------------------------------ script file */

let cached: { path: string; mtimeMs: number; script: DemoScript } | null = null;

/** Reads and validates app/demo/script.json; re-reads when the file changes. Null when it is missing. */
export async function loadScriptFile(): Promise<DemoScript | null> {
	const path = join(config.demoDir, 'script.json');
	let mtimeMs: number;
	try {
		mtimeMs = (await stat(path)).mtimeMs;
	} catch {
		return null;
	}
	if (cached && cached.path === path && cached.mtimeMs === mtimeMs) return cached.script;
	const script = parseDemoScript(JSON.parse(await readFile(path, 'utf8')));
	cached = { path, mtimeMs, script };
	return script;
}

/* ------------------------------------------------------------ session merge */

const SNAPSHOT_KEYS = [
	'stage',
	'location',
	'event',
	'wardrobe',
	'looks',
	'decision',
	'chosenLookId',
	'face',
	'lookbook',
	'shoppingList'
] as const;

/**
 * Merges a scripted session snapshot into the live demo session. Keeps id, mode ('demo'),
 * createdAt and the message history, and the cap of the live session. Fields the snapshot
 * omits are cleared, like the client does when it replaces its state on a `session` frame.
 */
export function mergeSnapshot(session: Session, snap: SessionSnapshot): void {
	const next = structuredClone(snap);
	const target = session as unknown as Record<string, unknown>;
	for (const key of SNAPSHOT_KEYS) {
		if (next[key] === undefined) delete target[key];
		else target[key] = next[key];
	}
	session.photos = { ...session.photos, ...next.photos };
	if (next.units) {
		// Keep the timestamps of entries that were already there; stamp new ones now.
		const ledger = next.units.ledger.map((entry, i) => {
			const old = session.units.ledger[i];
			return old && old.feature === entry.feature
				? { ...entry, at: old.at }
				: { ...entry, at: new Date().toISOString() };
		});
		session.units = { spent: next.units.spent, cap: session.units.cap, ledger };
	}
	session.mode = 'demo';
}

/* ------------------------------------------------------------------ player */

function countUserMessages(ctx: TurnContext): number {
	return ctx.session.messages.filter((m) => m.role === 'user' && m.id !== ctx.userMessage.id)
		.length;
}

/** Next turn per session after a button was pressed ahead of the script (turns were skipped). */
const progress = new Map<string, number>();

function pickTurn(script: DemoScript, ctx: TurnContext, input: TurnInput): number {
	let index = Math.max(countUserMessages(ctx), progress.get(ctx.session.id) ?? 0);
	const action = input.action;
	if (
		action &&
		index < script.turns.length &&
		script.turns[index].user.action?.type !== action.type
	) {
		// A button (e.g. "Finish this look") pressed before the script got there: jump to its turn.
		const ahead = script.turns.findIndex(
			(t, i) => i > index && t.user.action?.type === action.type
		);
		if (ahead !== -1) index = ahead;
	}
	return index;
}

async function reemitUserMessage(ctx: TurnContext, turn: DemoTurn): Promise<void> {
	const wantAttachments =
		turn.user.attachments.length > 0 && ctx.userMessage.attachments.length === 0;
	const wantText = !ctx.userMessage.text.trim();
	if (!wantAttachments && !wantText) return;
	const stored = ctx.session.messages.find((m) => m.id === ctx.userMessage.id);
	for (const message of new Set<ChatMessage>([ctx.userMessage, ...(stored ? [stored] : [])])) {
		if (wantAttachments) message.attachments = structuredClone(turn.user.attachments);
		if (wantText) message.text = turn.user.text;
	}
	if (wantAttachments) {
		for (const att of turn.user.attachments) {
			if (PHOTO_SLOTS.includes(att.purpose as PhotoSlot)) {
				ctx.session.photos[att.purpose as PhotoSlot] = structuredClone(att.asset);
			}
		}
	}
	ctx.emit({ type: 'message', message: structuredClone(ctx.userMessage) });
	await ctx.sessionChanged();
}

export function createDemoPlayer(options: DemoPlayerOptions = {}) {
	const loadScript = options.loadScript ?? loadScriptFile;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const speed = options.speed ?? PLAYBACK_SPEED;
	const maxWait = options.maxWaitMs ?? MAX_WAIT_MS;

	const runTurn: TurnRunner = async (ctx, input) => {
		const script = await loadScript();
		if (!script) {
			ctx.text(
				'Demo mode has no saved run on this server (app/demo/script.json is missing). Run `pnpm demo:build` to create it.'
			);
			return;
		}

		const index = pickTurn(script, ctx, input);
		if (index >= script.turns.length) {
			ctx.text(END_OF_DEMO_TEXT);
			ctx.block({ type: 'suggestions', options: ['How do I start a live session?'] });
			return;
		}
		const turn = script.turns[index];
		progress.set(ctx.session.id, index + 1);

		await reemitUserMessage(ctx, turn);

		const typed = input.text.trim();
		const matchesAction = Boolean(input.action) && turn.user.action?.type === input.action?.type;
		if (typed && !matchesAction && normalizeLabel(typed) !== normalizeLabel(turn.user.text)) {
			ctx.text(OFF_SCRIPT_NOTE);
		}

		let elapsed = 0;
		for (const { at, event } of turn.events) {
			const wait = Math.min(Math.max(0, at - elapsed) / speed, maxWait);
			elapsed = at;
			if (wait > 0) await sleep(wait);
			switch (event.type) {
				case 'text_delta':
					ctx.text(event.delta);
					break;
				case 'block':
					ctx.block(structuredClone(event.block));
					break;
				case 'activity':
					ctx.activity(`${ctx.session.id}:${event.id}`, event.label, event.status, event.detail);
					break;
				case 'session':
					mergeSnapshot(ctx.session, event.session);
					await ctx.sessionChanged();
					break;
				// The runner owns message, done and error frames.
				default:
					break;
			}
		}
	};

	/** The greeting and starting state for a new demo session, or null without a script. */
	async function initialSession(): Promise<Partial<Session> | null> {
		let script: DemoScript | null;
		try {
			script = await loadScript();
		} catch (err) {
			console.error('[demo] could not load app/demo/script.json', err);
			return null;
		}
		if (!script) return null;
		const init = structuredClone(script.initial);
		// The new session gets its own id, mode, createdAt and unit cap.
		delete init.id;
		delete init.mode;
		delete init.createdAt;
		delete init.units;
		const now = new Date().toISOString();
		init.messages = (init.messages ?? []).map((m) => ({ ...m, id: randomUUID(), createdAt: now }));
		return init;
	}

	return { runTurn, initialSession };
}

const player = createDemoPlayer();

export const runDemoTurn: TurnRunner = player.runTurn;

export async function demoInitialSession(): Promise<Partial<Session> | null> {
	return player.initialSession();
}
