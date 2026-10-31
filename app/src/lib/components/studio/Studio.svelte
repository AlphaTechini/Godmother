<!-- The studio: conversation on the left, the canvas on the right; two tabs on phones. -->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import LayoutPanelLeft from '@lucide/svelte/icons/layout-panel-left';
	import StudioHeader from './StudioHeader.svelte';
	import Thread from '#lib/components/chat/Thread.svelte';
	import Composer from '#lib/components/chat/Composer.svelte';
	import Canvas from '#lib/components/canvas/Canvas.svelte';
	import { SessionClient } from '#lib/client/session.svelte';
	import { StudioUI, setStudio } from '#lib/client/studio.svelte';
	import { mockTransport } from '#lib/client/mock.svelte';
	import type { Session } from '#lib/types';

	let {
		session,
		offline = false,
		speed = 1
	}: { session: Session; offline?: boolean; speed?: number } = $props();

	// One client per mounted studio; the route keys this component by session id.
	const client: SessionClient = untrack(
		() =>
			new SessionClient(session, offline ? mockTransport(() => client.session, speed) : undefined)
	);
	const ui = setStudio(new StudioUI(client));

	onMount(() => void client.resumeRunningTurn());

	// On phones, flag new canvas content while the chat tab is showing.
	let lastView = ui.view;
	$effect(() => {
		const v = ui.view;
		const stage = client.session.stage;
		void stage;
		if (v !== lastView && ui.tab === 'chat') ui.canvasFresh = true;
		lastView = v;
	});
</script>

<div class="studio">
	<StudioHeader {offline} />

	<div class="tabs" role="tablist" aria-label="Studio">
		<button
			type="button"
			role="tab"
			id="tab-chat"
			aria-controls="pane-chat"
			aria-selected={ui.tab === 'chat'}
			onclick={() => (ui.tab = 'chat')}
		>
			<MessageCircle size={15} strokeWidth={1.6} aria-hidden="true" /> Conversation
			{#if client.streaming}<span class="live" aria-label="(Godmother is replying)"></span>{/if}
		</button>
		<button
			type="button"
			role="tab"
			id="tab-canvas"
			aria-controls="pane-canvas"
			aria-selected={ui.tab === 'canvas'}
			onclick={() => {
				ui.tab = 'canvas';
				ui.canvasFresh = false;
			}}
		>
			<LayoutPanelLeft size={15} strokeWidth={1.6} aria-hidden="true" /> Canvas
			{#if ui.canvasFresh}<span class="fresh" aria-label="(updated)"></span>{/if}
		</button>
		<span class="indicator" class:right={ui.tab === 'canvas'} aria-hidden="true"></span>
	</div>

	<main class="panes" class:show-canvas={ui.tab === 'canvas'}>
		<div class="chat" id="pane-chat" role="tabpanel" aria-labelledby="tab-chat">
			<div class="thread"><Thread /></div>
			<div class="composer"><Composer /></div>
		</div>
		<div class="canvas" id="pane-canvas" role="tabpanel" aria-labelledby="tab-canvas">
			<Canvas />
		</div>
	</main>
</div>

<style>
	.studio {
		display: grid;
		grid-template-rows: auto auto 1fr;
		grid-template-columns: minmax(0, 1fr);
		height: 100dvh;
		overflow: hidden;
	}
	.panes {
		grid-row: 3;
		display: grid;
		grid-template-columns: clamp(360px, 31vw, 460px) minmax(0, 1fr);
		min-height: 0;
	}
	.chat {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		min-height: 0;
		background: var(--surface);
		border-right: 1px solid var(--line);
	}
	.thread {
		min-height: 0;
	}
	.composer {
		padding: var(--space-3) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
		background: linear-gradient(transparent, var(--surface) 30%);
	}
	.canvas {
		min-height: 0;
		min-width: 0;
		background: var(--bg);
	}
	.tabs {
		grid-row: 2;
		display: none;
	}

	@media (max-width: 900px) {
		.tabs {
			position: relative;
			display: grid;
			grid-template-columns: 1fr 1fr;
			border-bottom: 1px solid var(--line);
			background: var(--bg);
		}
		.tabs button {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			height: 44px;
			font-size: var(--text-sm);
			color: var(--text-3);
			transition: color var(--dur-2) var(--ease-out);
		}
		.tabs button[aria-selected='true'] {
			color: var(--text);
		}
		.indicator {
			position: absolute;
			left: 0;
			bottom: -1px;
			width: 50%;
			height: 1px;
			background: var(--accent);
			transition: transform var(--dur-3) var(--ease-out);
		}
		.indicator.right {
			transform: translateX(100%);
		}
		.live,
		.fresh {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--accent);
		}
		.live {
			animation: gm-pulse 1.2s var(--ease-in-out) infinite;
		}
		.panes {
			grid-template-columns: 100% 100%;
			overflow: hidden;
		}
		.chat,
		.canvas {
			grid-row: 1;
			transition:
				transform var(--dur-3) var(--ease-out),
				visibility var(--dur-3);
		}
		.chat {
			grid-column: 1;
			border-right: 0;
		}
		.canvas {
			grid-column: 2;
		}
		.show-canvas .chat,
		.show-canvas .canvas {
			transform: translateX(-100%);
		}
		.show-canvas .chat,
		.panes:not(.show-canvas) .canvas {
			visibility: hidden;
		}
	}
</style>
