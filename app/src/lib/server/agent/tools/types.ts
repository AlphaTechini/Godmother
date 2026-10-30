// Shared shapes for tool definitions, plus the small validation toolkit the tools use.

import type { TurnContext } from '#lib/server/turn';
import type { ModelClient } from '#lib/server/llm';
import type { NamedColor, Session } from '#lib/types';
import type { AgentState } from '../state';

export interface ToolEnv {
	ctx: TurnContext;
	session: Session;
	agent: AgentState;
	model: ModelClient;
	/** Persists the agent sidecar (call after registering products or sew designs). */
	saveAgent(): Promise<void>;
}

export interface ToolDef {
	name: string;
	description: string;
	/** JSON Schema for the arguments. */
	parameters: Record<string, unknown>;
	/** Strict structured arguments. Off only where the schema cannot be expressed strictly. */
	strict: boolean;
	/** Progress line while the tool runs. null: the tool reports its own progress. */
	label(args: Record<string, unknown>, env: ToolEnv): string | null;
	/** Runs the tool. Returns JSON for the model; throws ToolError for problems the model can fix. */
	run(args: Record<string, unknown>, env: ToolEnv): Promise<unknown>;
	/** When a round calls only terminal tools and the assistant already wrote text, the turn ends. */
	terminal?: boolean;
}

/** A problem the model can act on (bad arguments, missing prerequisite). Returned as the tool output. */
export class ToolError extends Error {
	constructor(
		message: string,
		readonly details?: unknown
	) {
		super(message);
	}
}

/* ------------------------------------------------------------- validation */

export type Rec = Record<string, unknown>;

export function isRec(v: unknown): v is Rec {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Collects validation problems with their paths, so the model gets all of them at once. */
export class Problems {
	readonly list: string[] = [];
	add(path: string, message: string): void {
		this.list.push(path ? `${path}: ${message}` : message);
	}
	get ok(): boolean {
		return this.list.length === 0;
	}
	/** Throws a ToolError that carries every problem. */
	throwIfAny(prefix = 'Invalid arguments.'): void {
		if (!this.ok) throw new ToolError(prefix, { errors: this.list });
	}
}

const present = (v: unknown) => v !== undefined && v !== null && v !== '';

export function readString(
	p: Problems,
	v: unknown,
	path: string,
	opts: { required?: boolean; max?: number } = {}
): string | undefined {
	const { required = true, max = 600 } = opts;
	if (!present(v)) {
		if (required) p.add(path, 'is required.');
		return undefined;
	}
	if (typeof v !== 'string') {
		p.add(path, 'must be a string.');
		return undefined;
	}
	const s = v.trim();
	if (!s && required) {
		p.add(path, 'must not be empty.');
		return undefined;
	}
	return s.slice(0, max) || undefined;
}

/** "#abc" and "ABCDEF" become "#AABBCC" style: always "#RRGGBB" upper-case. */
export function normalizeHex(v: unknown): string | undefined {
	if (typeof v !== 'string') return undefined;
	let s = v.trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{3}$/.test(s)) s = [...s].map((c) => c + c).join('');
	return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toUpperCase()}` : undefined;
}

export function readHex(
	p: Problems,
	v: unknown,
	path: string,
	required = false
): string | undefined {
	if (!present(v)) {
		if (required) p.add(path, 'is required.');
		return undefined;
	}
	const hex = normalizeHex(v);
	if (!hex) p.add(path, `"${String(v)}" is not a #RRGGBB hex colour.`);
	return hex;
}

export function readColors(
	p: Problems,
	v: unknown,
	path: string,
	opts: { max?: number; required?: boolean } = {}
): NamedColor[] {
	const { max = 8, required = false } = opts;
	if (!present(v)) {
		if (required) p.add(path, 'is required.');
		return [];
	}
	if (!Array.isArray(v)) {
		p.add(path, 'must be an array of { name, hex }.');
		return [];
	}
	const out: NamedColor[] = [];
	v.slice(0, max).forEach((c, i) => {
		if (!isRec(c)) return p.add(`${path}[${i}]`, 'must be { name, hex }.');
		const name = readString(p, c.name, `${path}[${i}].name`, { max: 40 });
		const hex = readHex(p, c.hex, `${path}[${i}].hex`, true);
		if (name && hex) out.push({ name, hex });
	});
	return out;
}

export function readEnum<T extends string>(
	p: Problems,
	v: unknown,
	path: string,
	allowed: readonly T[],
	required = true
): T | undefined {
	if (!present(v)) {
		if (required) p.add(path, `is required (one of ${allowed.join(', ')}).`);
		return undefined;
	}
	const hit = allowed.find((a) => a === v);
	if (!hit) p.add(path, `"${String(v)}" is not one of ${allowed.join(', ')}.`);
	return hit;
}

export function readStringArray(
	p: Problems,
	v: unknown,
	path: string,
	opts: { max?: number; maxLen?: number } = {}
): string[] {
	if (!present(v)) return [];
	if (!Array.isArray(v)) {
		p.add(path, 'must be an array of strings.');
		return [];
	}
	return v
		.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
		.map((x) => x.trim().slice(0, opts.maxLen ?? 300))
		.slice(0, opts.max ?? 12);
}

export function readNumber(
	p: Problems,
	v: unknown,
	path: string,
	opts: { min?: number; max?: number; required?: boolean } = {}
): number | undefined {
	const { required = true } = opts;
	if (!present(v)) {
		if (required) p.add(path, 'is required.');
		return undefined;
	}
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		p.add(path, 'must be a number.');
		return undefined;
	}
	if (opts.min !== undefined && v < opts.min) p.add(path, `must be at least ${opts.min}.`);
	if (opts.max !== undefined && v > opts.max) p.add(path, `must be at most ${opts.max}.`);
	return v;
}

/** Runs async work over a list with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

export function unitsLeft(session: Session): number {
	return Math.max(0, session.units.cap - session.units.spent);
}
