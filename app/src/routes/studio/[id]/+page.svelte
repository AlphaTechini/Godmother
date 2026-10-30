<script lang="ts">
	import Studio from '#lib/components/studio/Studio.svelte';
	import StudioError from '#lib/components/studio/StudioError.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.kind === 'session' ? `${data.session.event?.name ?? 'New evening'} · Godmother` : 'Godmother'}</title>
</svelte:head>

{#if data.kind === 'session'}
	{#key data.key}
		<Studio session={data.session} offline={data.offline} speed={data.speed} />
	{/key}
{:else}
	<StudioError reason={data.reason} message={data.message} />
{/if}
