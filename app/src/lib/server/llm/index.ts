// The one place that picks the model provider. Callers only see the contract in types.ts.

import { createAnthropicClient } from './anthropic';
import type { ModelClient } from './types';

export type * from './types';
export { ModelTransientError } from './types';
export { assetInputPart } from './media';
export { collectSources } from './helpers';

let override: ModelClient | null = null;
let shared: ModelClient | null = null;

/** The client every agent call uses. Created lazily so importing this module never needs a key. */
export function getModelClient(): ModelClient {
	if (override) return override;
	shared ??= createAnthropicClient();
	return shared;
}

/** Tests inject a fake here; pass null to go back to the real client. */
export function setModelClient(client: ModelClient | null): void {
	override = client;
}
