import { defineConfig } from 'vitest/config';
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// DEPLOY_TARGET=static builds only the pages, for hosting them apart from the API.
			adapter:
				process.env.DEPLOY_TARGET === 'static'
					? staticAdapter({ fallback: '200.html' })
					: nodeAdapter(),
			// adapter-node assumes https; allow plain-http local production runs to upload photos.
			csrf: {
				trustedOrigins: (
					process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:4173'
				)
					.split(',')
					.map((o) => o.trim())
					.filter(Boolean)
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
