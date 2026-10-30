// Turns a recorded live session into the demo fixture.
// Run: pnpm demo:export <sessionId> [--title "..."]
//
// Reads DATA_DIR/sessions/<id>/events.jsonl (written by the recorder while the session ran) and
// session.json, rebuilds app/demo/script.json, and copies every image the session produced into
// app/demo/assets/ under a `demo-<uuid>` id. Needs no API keys and spends nothing.

import 'dotenv/config';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	actionLabel,
	checkSuggestionChain,
	finalSuggestions,
	turnDurationMs,
	type DemoEvent,
	type DemoScript,
	type DemoTurn
} from '../src/lib/server/demo/script';
import type { Attachment, ChatMessage, Session, StreamEvent, UserAction } from '../src/lib/types';

/* The recorder's line format (src/lib/server/store/recorder.ts). */
interface RecordedUserTurn {
	type: 'user';
	turn: number;
	input: { text: string; attachments: Attachment[]; action?: UserAction };
}
interface RecordedEvent {
	type: 'event';
	turn: number;
	t: number;
	event: StreamEvent;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const ASSET_URL_RE = new RegExp(`/api/assets/(${UUID})(?![0-9a-f-])`, 'gi');
const ASSET_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'heic'];
/** What app/src/lib/server/store/assets.ts can serve for a `demo-` id. */
const DEMO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg']);

export interface ExportOptions {
	sessionId: string;
	title?: string;
	/** DATA_DIR of the server that recorded the session. */
	dataDir: string;
	/** app/demo */
	demoDir: string;
	log?: (line: string) => void;
}

export interface ExportSummary {
	scriptPath: string;
	title: string;
	turns: number;
	events: number;
	durationSeconds: number;
	unitsSpent?: number;
	assetsCopied: number;
	assetBytes: number;
	assetsMissing: string[];
	assetsConverted: number;
	dropped: { message: number; done: number; error: number; errorBlocks: number };
	malformedLines: number;
	suggestionsFixed: number;
	warnings: string[];
}

class ExportError extends Error {}

/* -------------------------------------------------------------- recording */

interface Recording {
	users: Map<number, RecordedUserTurn['input']>;
	events: Map<number, RecordedEvent[]>;
	malformed: number;
}

export function parseRecording(jsonl: string): Recording {
	const rec: Recording = { users: new Map(), events: new Map(), malformed: 0 };
	for (const line of jsonl.split('\n')) {
		if (!line.trim()) continue;
		let parsed: RecordedUserTurn | RecordedEvent;
		try {
			parsed = JSON.parse(line);
		} catch {
			rec.malformed++;
			continue;
		}
		if (parsed?.type === 'user' && Number.isInteger(parsed.turn) && parsed.input) {
			rec.users.set(parsed.turn, parsed.input);
		} else if (parsed?.type === 'event' && Number.isInteger(parsed.turn) && parsed.event) {
			const list = rec.events.get(parsed.turn) ?? [];
			list.push(parsed);
			rec.events.set(parsed.turn, list);
		} else {
			rec.malformed++;
		}
	}
	return rec;
}

/* ----------------------------------------------------------------- assets */

/** Rewrites every `/api/assets/<uuid>` to `/api/assets/demo-<uuid>` and Asset ids to `demo-<uuid>`. */
export function rewriteAssets<T>(value: T, found: Set<string>): T {
	const walk = (v: unknown): unknown => {
		if (typeof v === 'string') {
			return v.replace(ASSET_URL_RE, (_m, id: string) => {
				found.add(id.toLowerCase());
				return `/api/assets/demo-${id.toLowerCase()}`;
			});
		}
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === 'object') {
			const src = v as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			for (const [k, child] of Object.entries(src)) out[k] = walk(child);
			// An Asset: id is the uuid its url points at.
			if (
				typeof src.id === 'string' &&
				UUID_RE.test(src.id) &&
				typeof src.url === 'string' &&
				src.url.toLowerCase().includes(`/api/assets/${src.id.toLowerCase()}`)
			) {
				found.add(src.id.toLowerCase());
				out.id = `demo-${src.id.toLowerCase()}`;
			}
			return out;
		}
		return v;
	};
	return walk(value) as T;
}

async function findAssetFile(
	dataDir: string,
	id: string
): Promise<{ path: string; ext: string } | null> {
	for (const ext of ASSET_EXTS) {
		const path = join(dataDir, 'assets', `${id}.${ext}`);
		try {
			if ((await stat(path)).isFile()) return { path, ext };
		} catch {
			/* try next */
		}
	}
	return null;
}

/* ------------------------------------------------------------------ build */

const DEFAULT_GREETING =
	'Hello, I’m Godmother. Tell me about the event you need to dress for: its name, a link, or a photo of the invitation. I’ll look up the dress code, colours and venue, find real pieces in local shops, try them on you, and make the final call easy.\n\nYou’re in demo mode, so this is a saved run: no photos leave your device and no credits are spent.';

function userText(input: RecordedUserTurn['input']): string {
	const text = input.text?.trim();
	if (text) return input.text;
	if (input.action) return actionLabel(input.action);
	return input.attachments?.length ? 'Here are my photos' : 'Continue';
}

export interface BuiltScript {
	script: DemoScript;
	dropped: ExportSummary['dropped'];
	suggestionsFixed: number;
	warnings: string[];
}

/** Pure part of the export: recorded lines -> DemoScript (asset ids not rewritten yet). */
export function buildScript(rec: Recording, title: string): BuiltScript {
	const dropped = { message: 0, done: 0, error: 0, errorBlocks: 0 };
	const warnings: string[] = [];
	let suggestionsFixed = 0;

	const indexes = [...rec.users.keys()].sort((a, b) => a - b);
	for (const turn of rec.events.keys()) {
		if (!rec.users.has(turn))
			warnings.push(`Events for turn ${turn} have no recorded user message; skipped.`);
	}

	const turns: DemoTurn[] = indexes.map((index) => {
		const input = rec.users.get(index)!;
		const lines = (rec.events.get(index) ?? [])
			.map((l, i) => ({ l, i }))
			.sort((a, b) => a.l.t - b.l.t || a.i - b.i)
			.map(({ l }) => l);
		const events: DemoEvent[] = [];
		for (const { t, event } of lines) {
			if (event.type === 'message') dropped.message++;
			else if (event.type === 'done') dropped.done++;
			else if (event.type === 'error') dropped.error++;
			else if (event.type === 'block' && event.block.type === 'error') dropped.errorBlocks++;
			else events.push({ at: Math.max(0, Math.round(t)), event: structuredClone(event) });
		}
		if (events.length === 0) {
			warnings.push(`Turn ${index} has no playable events (it may have failed in the recording).`);
		}
		return {
			user: {
				text: userText(input),
				attachments: structuredClone(input.attachments ?? []),
				...(input.action ? { action: input.action } : {})
			},
			events
		};
	});

	// Every turn ends with a suggestions block whose first option is the next turn's text.
	turns.forEach((turn, i) => {
		const next = turns[i + 1];
		const want = next ? next.user.text : 'Thank you, Godmother';
		const current = finalSuggestions(turn);
		if (current && current[0] === want) return;
		suggestionsFixed++;
		// Take the recorded chips out wherever they are, keep their options, and re-append at the end.
		let options: string[] = [];
		turn.events = turn.events.filter(({ event }) => {
			if (event.type === 'block' && event.block.type === 'suggestions') {
				options = [...options, ...event.block.options];
				return false;
			}
			return true;
		});
		const merged = [want, ...options.filter((o) => o !== want)].slice(0, 4);
		const at = (turn.events.at(-1)?.at ?? 0) + 200;
		turn.events.push({
			at,
			event: {
				type: 'block',
				messageId: '$assistant',
				block: { type: 'suggestions', options: merged }
			}
		});
	});

	const greeting: ChatMessage = {
		id: 'greeting',
		role: 'assistant',
		createdAt: new Date().toISOString(),
		text: DEFAULT_GREETING,
		attachments: [],
		blocks: [
			{
				type: 'suggestions',
				options: [turns[0]?.user.text ?? 'I need an outfit for an event']
			}
		]
	};
	const script: DemoScript = {
		version: 1,
		title,
		initial: { stage: 'event', photos: {}, wardrobe: [], looks: [], messages: [greeting] },
		turns
	};
	return { script, dropped, suggestionsFixed, warnings };
}

/* ----------------------------------------------------------------- export */

export async function exportDemo(opts: ExportOptions): Promise<ExportSummary> {
	const log = opts.log ?? (() => {});
	const id = opts.sessionId.toLowerCase();
	if (!UUID_RE.test(id))
		throw new ExportError(`"${opts.sessionId}" is not a session id (expected a uuid).`);

	const dir = join(opts.dataDir, 'sessions', id);
	let jsonl: string;
	try {
		jsonl = await readFile(join(dir, 'events.jsonl'), 'utf8');
	} catch {
		throw new ExportError(
			`No recording at ${join(dir, 'events.jsonl')}. Only live sessions are recorded, and DATA_DIR must be the server's data directory (currently ${opts.dataDir}).`
		);
	}
	let session: Session | null = null;
	try {
		session = JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')) as Session;
	} catch {
		log('session.json not found or unreadable; continuing from the event log only.');
	}

	const rec = parseRecording(jsonl);
	if (rec.users.size === 0) throw new ExportError('The recording contains no user turns.');
	const title =
		opts.title?.trim() || `${session?.event?.name ?? 'Recorded session'} (recorded demo)`;
	const built = buildScript(rec, title);

	// Assets: collect, rewrite ids and urls, copy files.
	const found = new Set<string>();
	const script = rewriteAssets(built.script, found);
	const assetsOut = join(opts.demoDir, 'assets');
	await mkdir(assetsOut, { recursive: true });
	const missing: string[] = [];
	let copied = 0;
	let bytes = 0;
	let converted = 0;
	const warnings = [...built.warnings];
	for (const assetId of [...found].sort()) {
		const file = await findAssetFile(opts.dataDir, assetId);
		if (!file) {
			missing.push(assetId);
			continue;
		}
		let target = join(assetsOut, `${assetId}.${file.ext}`);
		if (!DEMO_EXTS.has(file.ext)) {
			// Demo assets are served as svg/png/jpg/webp; HEIC would 404, so convert it.
			try {
				const sharp = (await import('sharp')).default;
				target = join(assetsOut, `${assetId}.jpg`);
				await sharp(file.path).rotate().jpeg({ quality: 90 }).toFile(target);
				converted++;
			} catch (err) {
				warnings.push(
					`${assetId}: could not convert .${file.ext} to jpg (${(err as Error).message}); skipped.`
				);
				missing.push(assetId);
				continue;
			}
		} else {
			await copyFile(file.path, target);
		}
		bytes += (await stat(target)).size;
		copied++;
	}
	if (missing.length)
		warnings.push(`${missing.length} referenced asset(s) have no file and will 404.`);

	const chain = checkSuggestionChain(script);
	if (chain.length) warnings.push(...chain);

	const scriptPath = join(opts.demoDir, 'script.json');
	await mkdir(opts.demoDir, { recursive: true });
	await writeFile(scriptPath, JSON.stringify(script, null, 1) + '\n');

	const lastSession = script.turns
		.flatMap((t) => t.events)
		.filter((e) => e.event.type === 'session')
		.at(-1);
	return {
		scriptPath,
		title,
		turns: script.turns.length,
		events: script.turns.reduce((n, t) => n + t.events.length, 0),
		durationSeconds: script.turns.reduce((n, t) => n + turnDurationMs(t), 0) / 1000,
		unitsSpent:
			lastSession?.event.type === 'session' ? lastSession.event.session.units.spent : undefined,
		assetsCopied: copied,
		assetBytes: bytes,
		assetsMissing: missing,
		assetsConverted: converted,
		dropped: built.dropped,
		malformedLines: rec.malformed,
		suggestionsFixed: built.suggestionsFixed,
		warnings
	};
}

/* -------------------------------------------------------------------- CLI */

function parseArgs(argv: string[]): { sessionId?: string; title?: string } {
	const out: { sessionId?: string; title?: string } = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--title') out.title = argv[++i];
		else if (a.startsWith('--title=')) out.title = a.slice('--title='.length);
		else if (!a.startsWith('-') && !out.sessionId) out.sessionId = a;
	}
	return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const { sessionId, title } = parseArgs(process.argv.slice(2));
	if (!sessionId) {
		console.error(
			'Usage: pnpm demo:export <sessionId> [--title "My demo"]\n(set DATA_DIR if the server uses a custom data directory)'
		);
		process.exit(2);
	}
	try {
		const s = await exportDemo({
			sessionId,
			title,
			dataDir: process.env.DATA_DIR?.trim() || join(process.cwd(), 'data'),
			demoDir: join(dirname(fileURLToPath(import.meta.url)), '..', 'demo'),
			log: (l) => console.log(l)
		});
		console.log(`Wrote ${s.scriptPath}`);
		console.log(
			`  "${s.title}": ${s.turns} turns, ${s.events} events, ~${s.durationSeconds.toFixed(0)} s of playback`
		);
		if (s.unitsSpent !== undefined) console.log(`  units shown as spent: ${s.unitsSpent}`);
		console.log(
			`  assets: ${s.assetsCopied} copied (${(s.assetBytes / 1024 / 1024).toFixed(1)} MB)${s.assetsConverted ? `, ${s.assetsConverted} converted to jpg` : ''}, ${s.assetsMissing.length} missing`
		);
		console.log(
			`  dropped frames: ${s.dropped.message} message, ${s.dropped.done} done, ${s.dropped.error} error, ${s.dropped.errorBlocks} error blocks`
		);
		if (s.suggestionsFixed)
			console.log(
				`  ${s.suggestionsFixed} turn(s) got a closing suggestions block so the chips chain`
			);
		if (s.malformedLines) console.log(`  ${s.malformedLines} malformed line(s) skipped`);
		for (const w of s.warnings) console.warn(`  warning: ${w}`);
		console.log(
			'Restart the server (or just reload) to play it; `pnpm demo:build` restores the illustrated demo.'
		);
	} catch (err) {
		console.error(err instanceof ExportError ? err.message : err);
		process.exit(1);
	}
}
