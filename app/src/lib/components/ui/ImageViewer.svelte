<!-- Full-screen view of one image: zoom in, pan by scrolling, and download it. -->
<script lang="ts" module>
	export interface ViewedImage {
		src: string;
		alt: string;
		/** Shop photos belong to the shop, so they can be viewed but not downloaded. */
		canDownload: boolean;
	}

	const EXTENSIONS: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp',
		'image/heic': 'heic',
		'image/svg+xml': 'svg'
	};
</script>

<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	const MAX_ZOOM = 4;

	let { image, onclose }: { image: ViewedImage | null; onclose: () => void } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let zoom = $state(1);
	let fitWidth = $state(0);
	let saving = $state(false);
	let failure = $state('');

	$effect(() => {
		if (image && !dialog?.open) {
			zoom = 1;
			fitWidth = 0;
			failure = '';
			dialog?.showModal();
		}
		if (!image && dialog?.open) dialog.close();
	});

	const change = (by: number) => (zoom = Math.min(MAX_ZOOM, Math.max(1, zoom + by)));

	async function download() {
		if (!image) return;
		saving = true;
		failure = '';
		try {
			const res = await fetch(image.src);
			if (!res.ok) throw new Error(`Request failed (${res.status})`);
			const blob = await res.blob();
			const slug = image.alt
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `godmother${slug ? `-${slug}` : ''}.${EXTENSIONS[blob.type] ?? 'jpg'}`;
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			failure = 'That didn’t download. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<dialog bind:this={dialog} aria-label={image?.alt || 'Image'} {onclose}>
	{#if image}
		<div class="bar">
			<div class="group">
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-icon"
					aria-label="Zoom out"
					disabled={zoom <= 1}
					onclick={() => change(-1)}
				>
					<Minus />
				</button>
				<span class="level num" aria-live="polite">{zoom * 100}%</span>
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-icon"
					aria-label="Zoom in"
					disabled={zoom >= MAX_ZOOM}
					onclick={() => change(1)}
				>
					<Plus />
				</button>
			</div>
			<div class="group">
				{#if failure}<span class="failure" role="alert">{failure}</span>{/if}
				{#if image.canDownload}
					<button type="button" class="btn btn-primary btn-sm" disabled={saving} onclick={download}>
						<Download />{saving ? 'Saving…' : 'Download'}
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-icon"
					aria-label="Close"
					onclick={onclose}
				>
					<X />
				</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="stage" onclick={(e) => e.target === e.currentTarget && onclose()}>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
			<img
				src={image.src}
				alt={image.alt}
				class:zoomed={zoom > 1}
				style:width={zoom > 1 && fitWidth ? `${fitWidth * zoom}px` : undefined}
				onload={(e) => (fitWidth = e.currentTarget.clientWidth)}
				onclick={() => (zoom = zoom > 1 ? 1 : 2)}
			/>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: 100vw;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		padding: 0;
		border: 0;
		color: #f5f0e6;
		background: rgb(10 9 8 / 0.96);
	}
	dialog[open] {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.7);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}
	.group {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.level {
		min-width: 3.5em;
		text-align: center;
		font-size: var(--text-sm);
	}
	.failure {
		font-size: var(--text-sm);
		color: #e8806e;
	}
	.stage {
		display: flex;
		min-height: 0;
		overflow: auto;
		padding: 0 var(--space-4) var(--space-4);
	}
	img {
		/* Auto margins centre it and, unlike centring the row, keep a zoomed image's edges reachable. */
		margin: auto;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		cursor: zoom-in;
	}
	img.zoomed {
		max-width: none;
		max-height: none;
		cursor: zoom-out;
	}
</style>
