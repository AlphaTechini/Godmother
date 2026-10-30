<script lang="ts">
	import { onMount } from 'svelte';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { theme } from '#lib/client/theme.svelte';

	onMount(() => theme.init());
</script>

<button
	type="button"
	class="btn btn-ghost btn-icon"
	onclick={() => theme.toggle()}
	aria-label={theme.current === 'dark' ? 'Switch to daylight theme' : 'Switch to evening theme'}
	title={theme.current === 'dark' ? 'Daylight' : 'Evening'}
>
	{#if theme.current === 'dark'}<Sun strokeWidth={1.6} />{:else}<Moon strokeWidth={1.6} />{/if}
</button>
