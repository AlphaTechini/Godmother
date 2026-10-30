// The streaming tool-call loop: model -> tool calls -> tool outputs -> model, until a round has no calls.
//
// Conversation state inside a turn belongs to the model client (see llm/types.ts). The system prompt
// (rules + CURRENT STATE) is rebuilt and re-sent every round, because tools change the state.
// Across turns nothing is chained: the next turn rebuilds its input from the session (see history.ts).

import type { InputMessage, ToolCall, ToolResult, ToolSpec } from '#lib/server/llm';
import { buildSystem } from './prompt';
import { allTools } from './tools';
import { ToolError, isRec, type ToolDef, type ToolEnv } from './tools/types';

export const MAX_ROUNDS = 12;
const MAX_OUTPUT_CHARS = 14_000;

export interface LoopResult {
	rounds: number;
	/** True when the model was still calling tools after MAX_ROUNDS. */
	capped: boolean;
}

function toolSpecs(defs: readonly ToolDef[]): ToolSpec[] {
	return defs.map((d) => ({
		name: d.name,
		description: d.description,
		parameters: d.parameters,
		strict: d.strict
	}));
}

function safeJson(value: unknown): string {
	let text = JSON.stringify(value ?? { ok: true });
	if (text.length > MAX_OUTPUT_CHARS) {
		text = JSON.stringify({
			ok: true,
			truncated: true,
			partial: text.slice(0, MAX_OUTPUT_CHARS - 200)
		});
	}
	return text;
}

/** Runs one tool call and returns the output string the model will see. Never throws. */
async function executeCall(
	env: ToolEnv,
	call: ToolCall,
	defs: ReadonlyMap<string, ToolDef>
): Promise<string> {
	const { ctx } = env;
	const def = defs.get(call.name);
	if (!def) return safeJson({ ok: false, error: `Unknown tool "${call.name}".` });

	let args: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(call.arguments || '{}');
		if (!isRec(parsed)) throw new Error('not an object');
		args = parsed;
	} catch {
		return safeJson({
			ok: false,
			error: `The arguments for ${call.name} were not valid JSON. Call it again.`
		});
	}

	const actId = `tool:${call.id}`;
	let label: string | null = null;
	try {
		label = def.label(args, env);
	} catch {
		label = null;
	}
	if (label) ctx.activity(actId, label, 'running');
	try {
		const result = await def.run(args, env);
		if (label) ctx.activity(actId, label, 'done');
		return safeJson(result);
	} catch (err) {
		if (err instanceof ToolError) {
			if (label) ctx.activity(actId, label, 'failed', err.message);
			return safeJson({
				ok: false,
				error: err.message,
				...(err.details !== undefined ? { details: err.details } : {})
			});
		}
		console.error(`[agent] tool ${call.name} crashed`, err);
		if (label) ctx.activity(actId, label, 'failed');
		return safeJson({
			ok: false,
			error: `${call.name} failed unexpectedly. Carry on without it, or try a different approach.`
		});
	}
}

export async function runModelLoop(
	env: ToolEnv,
	input: InputMessage[],
	opts: { maxRounds?: number } = {}
): Promise<LoopResult> {
	const { ctx, session, agent, model } = env;
	const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
	const defs = allTools();
	const byName = new Map(defs.map((d) => [d.name, d]));
	const conversation = model.conversation({ input, tools: toolSpecs(defs) });
	let round = 0;

	while (round < maxRounds) {
		round++;
		let wroteThisRound = false;
		const write = (delta: string) => {
			if (!delta) return;
			// Commentary from an earlier round and the next round's text must not run together.
			if (!wroteThisRound) {
				wroteThisRound = true;
				const prior = ctx.assistantMessage.text;
				if (prior && !/\s$/.test(prior)) ctx.text('\n\n');
			}
			ctx.text(delta);
		};

		const { calls, refused } = await conversation.next(buildSystem(session, agent), write);
		if (refused) {
			write("I can't help with that one. Try putting it another way, or ask me something else.");
			return { rounds: round, capped: false };
		}
		if (calls.length === 0) return { rounds: round, capped: false };

		const outputs: ToolResult[] = [];
		for (const call of calls) {
			outputs.push({ callId: call.id, output: await executeCall(env, call, byName) });
		}

		// A round that only offered quick replies after writing its message is complete.
		const onlyTerminal = calls.every((c) => byName.get(c.name)?.terminal);
		if (onlyTerminal && ctx.assistantMessage.text.trim()) return { rounds: round, capped: false };

		conversation.submitToolResults(outputs);
	}
	return { rounds: round, capped: true };
}
