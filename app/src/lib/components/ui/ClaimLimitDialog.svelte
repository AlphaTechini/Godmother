<!-- Shown when someone presses Claim while waiting out the weekly limit. -->
<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { CONTACT_EMAIL } from '#lib/client/format';

	let {
		open,
		nextClaim,
		onclose
	}: {
		open: boolean;
		nextClaim: string;
		onclose: () => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (open && !dialog?.open) dialog?.showModal();
		if (!open && dialog?.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="claim-limit-title"
	{onclose}
	onclick={(e) => e.target === dialog && onclose()}
>
	<div class="body">
		<button type="button" class="close btn btn-ghost btn-icon" aria-label="Close" onclick={onclose}>
			<X />
		</button>
		<h2 id="claim-limit-title" class="display">Your next claim is on {nextClaim}</h2>
		<p>
			You’ve used your two daily claims, so you can now claim once a week. Each claim resets your
			balance to 60 units. It doesn’t add to what you have left.
		</p>
		<p>
			To request more units sooner, contact me at
			<a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.
		</p>
		<p>If you are a judge, also give me more API units.</p>
		<button type="button" class="btn btn-primary" onclick={onclose}>Got it</button>
	</div>
</dialog>

<style>
	dialog {
		width: min(460px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		padding: 0;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-2);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.6);
	}
	.body {
		position: relative;
		display: grid;
		gap: var(--space-4);
		padding: var(--space-6);
	}
	.close {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
	}
	h2 {
		margin: 0;
		padding-right: var(--space-7);
		font-size: var(--text-xl);
		line-height: 1.15;
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	a {
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.btn-primary {
		justify-self: start;
	}
	@media (max-width: 560px) {
		.body {
			padding: var(--space-5) var(--space-4);
		}
	}
</style>
