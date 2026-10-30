// Agent-side bookkeeping that does not fit Session: the product and sew-design registries.
// Stored next to the session as DATA_DIR/sessions/<id>/agent.json. Session fields stay the source of truth
// for everything the UI shows; the registry only gives the model stable ids to refer to.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionDir } from '#lib/server/store/paths';
import type { Money, PieceRole, Product, SewDesign } from '#lib/types';

export interface RegisteredProduct {
	id: string;
	role: PieceRole;
	product: Product;
	/** Price as listed by the shop, before conversion to the session currency. */
	originalPrice?: Money;
	/** Passed the image check (single front-facing item; worn photo for lower_body). */
	vetted: boolean;
	/** Why it did not pass, when it did not. */
	concern?: string;
}

export interface RegisteredSewDesign {
	id: string;
	role: PieceRole;
	description: string;
	design: SewDesign;
}

export interface AgentState {
	products: Record<string, RegisteredProduct>;
	sewDesigns: Record<string, RegisteredSewDesign>;
}

export function emptyAgentState(): AgentState {
	return { products: {}, sewDesigns: {} };
}

/** Short readable ids the model can copy exactly, e.g. "prod_a1b2c3". */
export function newId(prefix: string): string {
	return `${prefix}_${randomBytes(3).toString('hex')}`;
}

function agentFile(sessionId: string): string {
	return join(sessionDir(sessionId), 'agent.json');
}

export async function loadAgentState(sessionId: string): Promise<AgentState> {
	try {
		const raw = JSON.parse(await readFile(agentFile(sessionId), 'utf8')) as Partial<AgentState>;
		return {
			products: raw.products && typeof raw.products === 'object' ? raw.products : {},
			sewDesigns: raw.sewDesigns && typeof raw.sewDesigns === 'object' ? raw.sewDesigns : {}
		};
	} catch {
		return emptyAgentState();
	}
}

export async function saveAgentState(sessionId: string, state: AgentState): Promise<void> {
	const file = agentFile(sessionId);
	await mkdir(sessionDir(sessionId), { recursive: true });
	const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
	await writeFile(tmp, JSON.stringify(state));
	await rename(tmp, file);
}
