// The only place that reads process.env. Everything else imports `config`.
import 'dotenv/config';
import { join } from 'node:path';

function str(name: string): string | undefined {
	const v = process.env[name]?.trim();
	return v ? v : undefined;
}

function int(name: string, fallback: number): number {
	const raw = str(name);
	if (raw === undefined) return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
	const raw = str(name)?.toLowerCase();
	return allowed.find((a) => a === raw) ?? fallback;
}

const cwd = process.cwd();
const llmKey = str('ANTHROPIC_API_KEY');
const youcamKey = str('YOUCAM_API_KEY');

export const config = Object.freeze({
	dataDir: str('DATA_DIR') ?? join(cwd, 'data'),
	demoDir: join(cwd, 'demo'),
	llm: Object.freeze({
		apiKey: llmKey,
		model: str('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
		fastModel: str('ANTHROPIC_FAST_MODEL') ?? 'claude-haiku-5-5',
		effort: oneOf('ANTHROPIC_EFFORT', ['low', 'medium', 'high'] as const, 'medium')
	}),
	youcam: Object.freeze({
		apiKey: youcamKey,
		baseUrl: (str('YOUCAM_API_BASE') ?? 'https://yce-api-01.makeupar.com').replace(/\/+$/, ''),
		clothEndpoint: str('CLOTH_ENDPOINT') ?? 'cloth-v4',
		chainMode: oneOf('YOUCAM_CHAIN_MODE', ['url', 'reupload'] as const, 'reupload'),
		pollIntervalMs: int('YOUCAM_POLL_INTERVAL_MS', 3000),
		pollTimeoutMs: int('YOUCAM_POLL_TIMEOUT_MS', 300_000)
	}),
	unitCapPerSession: int('UNIT_CAP_PER_SESSION', 60),
	maxUploadBytes: 10 * 1024 * 1024,
	live: Object.freeze({
		llm: Boolean(llmKey),
		youcam: Boolean(youcamKey)
	})
});

export type Config = typeof config;
