// Shared by tests: builds a config pointing at fresh temp directories.
// Usage: vi.mock('#lib/server/config', async () => (await import('./test-config')).mockConfigModule());
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const testDirs = {
	dataDir: mkdtempSync(join(tmpdir(), 'godmother-data-')),
	demoDir: mkdtempSync(join(tmpdir(), 'godmother-demo-'))
};

export function mockConfigModule(live = { llm: false, youcam: false }) {
	return {
		config: {
			...testDirs,
			llm: { apiKey: live.llm ? 'x' : undefined, model: 'm', fastModel: 'f', effort: 'medium' },
			database: {},
			images: {},
			email: {},
			auth: {},
			youcam: {},
			unitCapPerSession: 60,
			maxUploadBytes: 10 * 1024 * 1024,
			live
		}
	};
}
