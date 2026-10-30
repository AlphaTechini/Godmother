<script lang="ts">
	import type { ChatMessage } from '#lib/types';
	import { getStudio } from '#lib/client/studio.svelte';
	import { PURPOSE_LABEL, formatTime } from '#lib/client/format';
	import Markdown from './Markdown.svelte';
	import ActivityLine from './ActivityLine.svelte';
	import Suggestions from './Suggestions.svelte';
	import BlockView from '#lib/components/blocks/BlockView.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let { message, last = false }: { message: ChatMessage; last?: boolean } = $props();

	const studio = getStudio();
	const client = $derived(studio.client);
	const streaming = $derived(client.streamingId === message.id);
	const activities = $derived(client.activitiesFor(message.id));
	const suggestions = $derived(
		message.blocks.flatMap((b) => (b.type === 'suggestions' ? b.options : []))
	);
	const blocks = $derived(message.blocks.filter((b) => b.type !== 'suggestions'));
	const settled = $derived(!streaming && activities.every((a) => a.status !== 'running'));
	let showSteps = $state(false);
	const totalSecs = $derived(
		activities.reduce((s, a) => s + (a.endedAt ? (a.endedAt - a.startedAt) / 1000 : 0), 0)
	);
</script>

{#if message.role === 'user'}
	<article class="user" aria-label="You said">
		{#if message.attachments.length}
			<ul class="atts">
				{#each message.attachments as a (a.asset.id)}
					<li>
						<span class="att-img">
							{#if a.asset.mime.startsWith('image/')}<img
									src={a.asset.url}
									alt={a.asset.label ?? PURPOSE_LABEL[a.purpose]}
								/>{/if}
						</span>
						<span class="att-label">{PURPOSE_LABEL[a.purpose]}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if message.text}<p class="bubble">{message.text}</p>{/if}
	</article>
{:else}
	<article class="assistant" aria-label="Godmother said" aria-busy={streaming}>
		<header>
			<span class="who">Godmother</span>
			{#if message.createdAt && !streaming}<time class="num" datetime={message.createdAt}
					>{formatTime(message.createdAt)}</time
				>{/if}
		</header>

		{#if activities.length}
			{#if settled && activities.length > 1}
				<button
					type="button"
					class="steps-toggle"
					aria-expanded={showSteps}
					onclick={() => (showSteps = !showSteps)}
				>
					<span
						>{activities.length} steps{#if totalSecs >= 1}<span class="num">
								· {totalSecs.toFixed(0)}s</span
							>{/if}</span
					>
					<ChevronDown size={13} strokeWidth={1.8} />
				</button>
			{/if}
			{#if !settled || showSteps || activities.length === 1}
				<ul class="activities" role="status" aria-live="polite">
					{#each activities as a (a.id)}<ActivityLine activity={a} />{/each}
				</ul>
			{/if}
		{/if}

		{#if message.text}
			<Markdown text={message.text} {streaming} />
		{:else if streaming && !activities.length}
			<p class="thinking" aria-label="Godmother is thinking">
				<span></span><span></span><span></span>
			</p>
		{/if}

		{#if blocks.length}
			<div class="blocks">
				{#each blocks as block, i (i)}<BlockView {block} />{/each}
			</div>
		{/if}

		{#if suggestions.length && last && !client.streaming}
			<div class="sugg">
				<Suggestions
					options={suggestions}
					highlightFirst={client.session.mode === 'demo'}
					onpick={(o) => studio.say(o)}
				/>
			</div>
		{/if}
	</article>
{/if}

<style>
	.user {
		display: grid;
		justify-items: end;
		gap: var(--space-2);
		margin-left: 12%;
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	.bubble {
		padding: 10px 14px;
		border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
		background: var(--surface-3);
		color: var(--text);
		font-size: var(--text-base);
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.atts {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
	}
	.atts li {
		display: grid;
		gap: 4px;
		justify-items: end;
	}
	.att-img {
		display: block;
		width: 72px;
		height: 90px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--plate);
		box-shadow: 0 0 0 1px var(--line);
	}
	.att-img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.att-label {
		font-size: var(--text-3xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.assistant {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.who {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-md);
		color: var(--accent);
	}
	time {
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	.activities {
		display: grid;
		gap: 6px;
		padding: var(--space-1) 0 var(--space-1) var(--space-3);
		border-left: 1px solid var(--line-strong);
	}
	.steps-toggle {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		color: var(--text-3);
		padding: 2px 0;
	}
	.steps-toggle:hover {
		color: var(--text-2);
	}
	.steps-toggle :global(svg) {
		transition: transform var(--dur-2) var(--ease-out);
	}
	.steps-toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}
	.blocks {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		margin-top: var(--space-1);
	}
	.sugg {
		margin-top: var(--space-1);
	}
	.thinking {
		display: flex;
		gap: 5px;
		height: 24px;
		align-items: center;
	}
	.thinking span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		animation: gm-pulse 1.2s var(--ease-in-out) infinite;
	}
	.thinking span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.thinking span:nth-child(3) {
		animation-delay: 0.3s;
	}
</style>
