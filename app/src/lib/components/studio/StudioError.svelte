<script lang="ts">
	import { goto } from '$app/navigation';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { createSession } from '#lib/client/api';

	let { reason, message }: { reason: 'not_found' | 'unreachable' | 'failed'; message: string } = $props();
	let busy: 'live' | 'demo' | null = $state(null);
	let failure = $state('');

	async function start(mode: 'live' | 'demo') {
		busy = mode;
		failure = '';
		try {
			const s = await createSession(mode);
			await goto(`/studio/${s.id}`);
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
		} finally {
			busy = null;
		}
	}
</script>

<main class="wrap">
	<Wordmark href="/" size={20} />
	<div class="body">
		<p class="eyebrow">{reason === 'not_found' ? 'Session not found' : 'Can’t open the studio'}</p>
		<h1 class="display">{reason === 'not_found' ? 'This evening has passed.' : 'The doors are closed for a moment.'}</h1>
		<p class="lede">{message} {reason === 'not_found' ? 'Start a new one, or watch the demo.' : 'You can still explore the offline preview.'}</p>
		<div class="actions">
			{#if reason === 'not_found'}
				<button type="button" class="btn btn-primary btn-lg" disabled={!!busy} onclick={() => start('demo')}>
					{#if busy === 'demo'}<Spinner />{/if} Try the demo
				</button>
				<button type="button" class="btn btn-secondary btn-lg" disabled={!!busy} onclick={() => start('live')}>
					{#if busy === 'live'}<Spinner />{/if} Start a new evening
				</button>
			{:else}
				<button type="button" class="btn btn-primary btn-lg" onclick={() => location.reload()}>Try again</button>
			{/if}
			<a class="btn btn-ghost btn-lg" href="/studio/mock?stage=looks">Offline preview</a>
		</div>
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
	</div>
</main>

<style>
	.wrap {
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr;
		padding: var(--space-6) var(--gutter);
	}
	.body {
		align-self: center;
		display: grid;
		gap: var(--space-4);
		max-width: 640px;
		padding-bottom: 10vh;
	}
	h1 {
		font-size: var(--text-4xl);
	}
	.lede {
		color: var(--text-2);
		font-size: var(--text-md);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
	.failure {
		color: var(--danger);
		font-size: var(--text-sm);
	}
</style>
