// Test-only: a mocked `#lib/server/config` with YouCam settings and a temp DATA_DIR.
// Usage: vi.mock('#lib/server/config', async () => (await import('./test-config')).mockYouCamConfig());
import { mockConfigModule, testDirs } from '#lib/server/store/test-config';

export { testDirs };

export function mockYouCamConfig() {
	const m = mockConfigModule({ llm: false, youcam: true });
	m.config.youcam = {
		apiKey: 'test-key',
		baseUrl: 'https://yce.test',
		clothEndpoint: 'cloth-v4',
		chainMode: 'reupload',
		pollIntervalMs: 1,
		pollTimeoutMs: 3000
	} as typeof m.config.youcam;
	return m;
}
