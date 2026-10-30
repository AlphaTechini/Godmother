<script lang="ts">
	import { tick } from 'svelte';
	import Message from './Message.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Link from '@lucide/svelte/icons/link';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';

	const studio = getStudio();
	const client = $derived(studio.client);
	const messages = $derived(client.session.messages);
	const lastAssistant = $derived(messages.findLastIndex((m) => m.role === 'assistant'));

	let scroller: HTMLElement | undefined = $state();
	let pinnedToBottom = true;

	function onScroll() {
		if (!scroller) return;
		pinnedToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
	}

	// Follow new content (text, blocks, images loading in) while the reader is at the bottom.
	// Scrolling is instant so a running animation never reads as the reader scrolling away.
	let content: HTMLElement | undefined = $state();
	const follow = () => {
		if (pinnedToBottom && scroller) scroller.scrollTop = scroller.scrollHeight;
	};
	$effect(() => {
		if (!content || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(follow);
		ro.observe(content);
		return () => ro.disconnect();
	});
	// Sending a message always brings the reader back to the bottom.
	$effect(() => {
		if (messages.at(-1)?.role === 'user') {
			pinnedToBottom = true;
			tick().then(follow);
		}
	});

	const starters = [
		{ icon: Link, label: 'Name or link', text: 'We’re going to ' },
		{ icon: Ticket, label: 'Upload the invitation', attach: true },
		{ icon: PenLine, label: 'Describe it', text: 'It’s a black-tie dinner on ' }
	] as const;
</script>

<div class="scroller" bind:this={scroller} onscroll={onScroll}>
	<div bind:this={content}>
		{#if messages.length === 0}
			<div class="intro">
				<p class="eyebrow">Good evening</p>
				<h2 class="display">What are we preparing for?</h2>
				<p class="lede">
					Tell me about the event. I’ll find the dress code, colours and setting, then dress you for
					it, head to toe.
				</p>
				<ul class="starters">
					{#each starters as s (s.label)}
						{@const Icon = s.icon}
						<li>
							<button
								type="button"
								onclick={() =>
									'attach' in s ? studio.attach('invitation') : studio.prefill(s.text)}
							>
								<Icon size={16} strokeWidth={1.5} aria-hidden="true" />
								{s.label}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div
				class="log"
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				aria-label="Conversation"
			>
				{#each messages as m, i (m.id)}
					<Message message={m} last={i === lastAssistant} />
				{/each}
			</div>
		{/if}

		{#if client.error}
			<div class="client-error" role="alert">
				<CircleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
				<div>
					<p><b>Something went wrong.</b> {client.error}</p>
					<div class="actions">
						{#if client.failed}
							<button
								type="button"
								class="btn btn-sm btn-primary"
								onclick={() => client.failed && client.send(client.failed)}>Try again</button
							>
						{/if}
						<button
							type="button"
							class="btn btn-sm btn-secondary"
							onclick={() => ((client.error = null), (client.failed = null))}>Dismiss</button
						>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.scroller {
		height: 100%;
		overflow-y: auto;
		overscroll-behavior: contain;
		overflow-anchor: none;
		padding: var(--space-6) var(--space-5) var(--space-4);
		scrollbar-width: thin;
		scrollbar-color: var(--line-strong) transparent;
	}
	.log {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-7);
	}
	.intro {
		display: grid;
		gap: var(--space-3);
		padding-top: clamp(16px, 8vh, 96px);
		animation: gm-fade-up var(--dur-4) var(--ease-out);
	}
	.intro h2 {
		font-size: var(--text-3xl);
		max-width: 12ch;
	}
	.lede {
		color: var(--text-2);
		max-width: 38ch;
	}
	.starters {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.starters button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--text);
		transition:
			border-color var(--dur-2) var(--ease-out),
			background-color var(--dur-2) var(--ease-out);
	}
	.starters button:hover {
		border-color: var(--accent-line);
		background: var(--accent-soft);
	}
	.starters :global(svg) {
		color: var(--accent);
	}
	.client-error {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-6);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: var(--text-sm);
	}
	.client-error :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
	}
	.client-error p {
		color: var(--text);
		margin-bottom: var(--space-2);
	}
</style>
