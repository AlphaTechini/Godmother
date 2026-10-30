// The streaming tool-call loop: model -> function calls -> tool outputs -> model, until a response has no calls.
//
// Conversation state inside a turn: after the first request, each round sends only the new function_call_output
// items plus previous_response_id, so images are not re-sent and reasoning items stay server-side. The
// instructions (system prompt + CURRENT STATE) are rebuilt and re-sent every round, because tools change the state.
// Across turns nothing is chained: the next turn rebuilds its input from the session (see history.ts).

import { config } from '#lib/server/config';
import type { ResponseCreateParamsStreaming, ResponseInputItem, Tool } from '#lib/server/openai';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses';
import { buildInstructions } from './prompt';
import { allTools } from './tools';
import { ToolError, isRec, type ToolDef, type ToolEnv } from './tools/types';

export const MAX_ROUNDS = 12;
const MAX_OUTPUT_CHARS = 14_000;

export interface LoopResult {
	rounds: number;
	/** True when the model was still calling tools after MAX_ROUNDS. */
	capped: boolean;
}

function toolSpecs(defs: readonly ToolDef[]): Tool[] {
	return defs.map((d) => ({
		type: 'function',
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

/** Runs one function call and returns the output string the model will see. Never throws. */
async function executeCall(
	env: ToolEnv,
	call: ResponseFunctionToolCall,
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

	const actId = `tool:${call.call_id}`;
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
	firstInput: ResponseInputItem[],
	opts: { maxRounds?: number } = {}
): Promise<LoopResult> {
	const { ctx, session, agent, model } = env;
	const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
	const defs = allTools();
	const byName = new Map(defs.map((d) => [d.name, d]));
	const tools = toolSpecs(defs);

	let input = firstInput;
	/** Full replay of the exchange, used only when a response id is missing. */
	const history: ResponseInputItem[] = [...firstInput];
	let previousId: string | undefined;
	let round = 0;

	while (round < maxRounds) {
		round++;
		const params: ResponseCreateParamsStreaming = {
			model: config.openai.model,
			instructions: buildInstructions(session, agent),
			input,
			tools,
			stream: true,
			reasoning: { effort: 'low' },
			...(previousId ? { previous_response_id: previousId } : {})
		};
		const stream = await model.stream(params);

		const calls: ResponseFunctionToolCall[] = [];
		let responseId: string | undefined;
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

		for await (const ev of stream) {
			switch (ev.type) {
				case 'response.created':
				case 'response.completed':
				case 'response.incomplete':
					responseId = ev.response.id || responseId;
					break;
				case 'response.output_text.delta':
				case 'response.refusal.delta':
					write(ev.delta);
					break;
				case 'response.output_item.done':
					if (ev.item.type === 'function_call') calls.push(ev.item);
					break;
				case 'response.failed':
					throw new Error(ev.response.error?.message ?? 'The model response failed.');
				case 'error':
					throw new Error(ev.message);
				default:
					break;
			}
		}

		if (calls.length === 0) return { rounds: round, capped: false };

		const outputs: ResponseInputItem[] = [];
		for (const call of calls) {
			outputs.push({
				type: 'function_call_output',
				call_id: call.call_id,
				output: await executeCall(env, call, byName)
			});
		}

		// A round that only offered quick replies after writing its message is complete.
		const onlyTerminal = calls.every((c) => byName.get(c.name)?.terminal);
		if (onlyTerminal && ctx.assistantMessage.text.trim()) return { rounds: round, capped: false };

		history.push(...calls, ...outputs);
		if (responseId) {
			previousId = responseId;
			input = outputs;
		} else {
			// No response id to chain on: replay the whole exchange instead.
			previousId = undefined;
			input = [...history];
		}
	}
	return { rounds: round, capped: true };
}
