<!-- Gives a specimen its own studio context over a fixture session. -->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { SessionClient } from '#lib/client/session.svelte';
	import { StudioUI, setStudio } from '#lib/client/studio.svelte';
	import { mockTransport } from '#lib/client/mock.svelte';
	import type { Session } from '#lib/types';

	let {
		session,
		setup,
		children
	}: { session: Session; setup?: (c: SessionClient) => void; children: Snippet } = $props();

	const client: SessionClient = untrack(() => {
		const c: SessionClient = new SessionClient(
			session,
			mockTransport((): Session => c.session)
		);
		setup?.(c);
		return c;
	});
	setStudio(new StudioUI(client));
</script>

{@render children()}
