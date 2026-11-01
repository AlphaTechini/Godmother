<!-- Shown when someone not signed in presses Start: an account, or carry on as a guest. -->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import X from '@lucide/svelte/icons/x';
	import Spinner from './Spinner.svelte';

	let {
		open,
		busy = false,
		guestUnits,
		userUnits,
		onguest,
		onclose
	}: {
		open: boolean;
		busy?: boolean;
		guestUnits: number;
		userUnits: number;
		onguest: () => void;
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
	aria-labelledby="start-title"
	{onclose}
	onclick={(e) => e.target === dialog && onclose()}
>
	<div class="body">
		<button type="button" class="close btn btn-ghost btn-icon" aria-label="Close" onclick={onclose}>
			<X />
		</button>
		<h2 id="start-title" class="display">How would you like to start?</h2>

		<div class="choices">
			<section class="choice" aria-labelledby="choice-account">
				<h3 id="choice-account">Create a free account</h3>
				<ul>
					<li><Check /><span>{userUnits} YouCam units to start</span></li>
					<li><Check /><span>Claim a fresh {userUnits} units each day</span></li>
					<li><Check /><span>Your evenings saved, on any device</span></li>
					<li><Check /><span>Your photos and looks open only for you</span></li>
				</ul>
				<a class="btn btn-primary" href="/account?mode=signup&next=start">Create an account</a>
			</section>

			<section class="choice" aria-labelledby="choice-guest">
				<h3 id="choice-guest">Continue as a guest</h3>
				<ul>
					<li><Minus /><span>{guestUnits} units once, with no refills</span></li>
					<li><Minus /><span>Shared with anyone on your IP address</span></li>
					<li><Minus /><span>No saved list; keep the link to come back</span></li>
					<li><Minus /><span>Anyone with the link can see your session</span></li>
				</ul>
				<button type="button" class="btn btn-secondary" disabled={busy} onclick={onguest}>
					{#if busy}<Spinner />Setting the table…{:else}Continue as a guest{/if}
				</button>
			</section>
		</div>

		<p class="note">
			A guest session moves into your account if you sign up later in this browser.
		</p>
	</div>
</dialog>

<style>
	dialog {
		width: min(680px, calc(100vw - 32px));
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
		gap: var(--space-5);
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
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}
	.choice {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
	}
	h3 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text);
	}
	ul {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	li {
		display: flex;
		gap: var(--space-2);
	}
	li :global(svg) {
		flex: none;
		width: 15px;
		height: 15px;
		margin-top: 2px;
	}
	.choice:first-child li :global(svg) {
		color: var(--accent);
	}
	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	@media (max-width: 560px) {
		.body {
			padding: var(--space-5) var(--space-4);
		}
		.choices {
			grid-template-columns: 1fr;
		}
	}
</style>
