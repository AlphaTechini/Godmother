<script lang="ts">
	import { onMount } from 'svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import UnitsMeter from '#lib/components/ui/UnitsMeter.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import { getAuthState } from '#lib/client/account';
	import { getStudio } from '#lib/client/studio.svelte';

	let { offline = false }: { offline?: boolean } = $props();

	const studio = getStudio();
	const client = $derived(studio.client);
	let accounts = $state(false);
	let signedIn = $state(false);

	onMount(() => {
		if (!offline)
			void getAuthState().then((a) => {
				accounts = a.accounts;
				signedIn = Boolean(a.user);
			});
	});

	const s = $derived(client.session);
	const chosen = $derived(s.looks.find((l) => l.id === s.chosenLookId));
	const lookbookDone = $derived(
		!!s.lookbook &&
			s.lookbook.steps.every((x) => x.status !== 'rendering' && x.status !== 'pending')
	);
	const allRendered = $derived(
		s.looks.every((l) => l.render.status === 'done' || l.render.status === 'failed')
	);

	/** The one next step, promoted to the header. */
	const next = $derived.by(() => {
		if (s.stage === 'looks' && s.looks.length > 1 && !s.decision)
			return {
				label: 'Decide for me',
				short: 'Decide',
				icon: Sparkles,
				disabled: !allRendered,
				run: () => studio.say('Decide for me.', { type: 'decide_for_me' })
			};
		if (s.stage === 'chosen' && chosen)
			return {
				label: 'Finish this look',
				short: 'Finish',
				icon: ArrowRight,
				disabled: false,
				run: () => studio.say('Finish this look.', { type: 'finish_look', lookId: chosen.id })
			};
		if (s.stage === 'finishing' && lookbookDone && !s.shoppingList)
			return {
				label: 'Shopping list',
				short: 'Shop',
				icon: ShoppingBag,
				disabled: false,
				run: () => studio.say('Build my shopping list.', { type: 'shopping_list' })
			};
		return null;
	});
</script>

<header class="topbar">
	<div class="left">
		<span class="mark-full"><Wordmark href="/" size={19} /></span>
		<span class="mark-small"><Wordmark href="/" size={17} /></span>
		<span class="divider" aria-hidden="true"></span>
		<div class="title">
			<h1>{s.event?.name ?? 'New evening'}</h1>
			<p>{s.event?.date ?? (s.stage === 'event' ? 'Tell Godmother about the event' : '')}</p>
		</div>
		{#if s.mode === 'demo'}
			<span
				class="tag tag-accent demo"
				title={offline
					? 'Offline preview with sample data'
					: 'Replays a recorded session; spends no units'}>{offline ? 'Preview' : 'Demo'}</span
			>
		{/if}
	</div>
	<div class="right">
		<UnitsMeter units={s.units} />
		<span class="theme"><ThemeToggle /></span>
		{#if accounts && s.mode === 'live'}
			<a class="btn btn-ghost btn-sm account" href="/account">{signedIn ? 'History' : 'Sign in'}</a>
		{/if}
		{#if next}
			{@const Icon = next.icon}
			<button
				type="button"
				class="btn btn-primary next"
				disabled={next.disabled || client.streaming}
				onclick={next.run}
			>
				<Icon /><span class="long">{next.label}</span><span class="short">{next.short}</span>
			</button>
		{/if}
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		height: 60px;
		padding: 0 var(--space-4) 0 var(--space-5);
		border-bottom: 1px solid var(--line);
		background: var(--bg);
	}
	.left,
	.right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.right {
		flex: none;
		gap: var(--space-2);
	}
	.divider {
		width: 1px;
		height: 24px;
		background: var(--line-strong);
		margin: 0 var(--space-1);
	}
	.title {
		min-width: 0;
		line-height: 1.2;
	}
	h1 {
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title p {
		font-size: var(--text-2xs);
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.demo {
		flex: none;
	}
	.mark-small,
	.short {
		display: none;
	}
	.mark-small :global(.name) {
		display: none;
	}
	@media (max-width: 900px) {
		.topbar {
			padding: 0 var(--space-2) 0 var(--space-4);
			height: 56px;
		}
		.mark-full,
		.divider,
		.long {
			display: none;
		}
		.mark-small,
		.short {
			display: inline;
		}
		.right :global(.label) {
			display: none;
		}
		.next {
			padding: 0 var(--space-3);
		}
	}
	@media (max-width: 560px) {
		.theme,
		.account {
			display: none;
		}
	}
	@media (max-width: 420px) {
		.right :global(.bar) {
			display: none;
		}
	}
</style>
