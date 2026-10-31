<script lang="ts">
	import { onMount } from 'svelte';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import {
		claimDailyUnits,
		claimGuestSessions,
		getAuthState,
		getUnits,
		listSavedSessions,
		NeedsVerification,
		resendCode,
		verifyEmail,
		requestPasswordReset,
		signIn,
		signOut,
		signUp,
		type AuthState,
		type SavedSession,
		type UserUnits
	} from '#lib/client/account';

	type Mode = 'signin' | 'signup' | 'forgot' | 'verify';

	let auth = $state<AuthState | null>(null);
	let mode = $state<Mode>('signin');
	let email = $state('');
	let password = $state('');
	let code = $state('');
	let busy = $state(false);
	let failure = $state('');
	let notice = $state('');
	let sessions = $state<SavedSession[] | null>(null);
	let listFailure = $state('');
	let units = $state<UserUnits | null>(null);
	let claiming = $state(false);
	let claimFailure = $state('');

	async function loadSessions() {
		listFailure = '';
		try {
			await claimGuestSessions();
			sessions = await listSavedSessions();
			units = await getUnits();
		} catch (e) {
			listFailure = e instanceof Error ? e.message : String(e);
		}
	}

	onMount(async () => {
		auth = await getAuthState();
		if (auth.user) await loadSessions();
	});

	async function claim() {
		claiming = true;
		claimFailure = '';
		try {
			units = await claimDailyUnits();
		} catch (e) {
			claimFailure = e instanceof Error ? e.message : String(e);
		} finally {
			claiming = false;
		}
	}

	function switchMode(next: Mode) {
		mode = next;
		failure = '';
		notice = '';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = '';
		notice = '';
		try {
			if (mode === 'forgot') {
				await requestPasswordReset(email);
				notice = 'If that email has an account, a reset link is on its way.';
			} else if (mode === 'signup') {
				await signUp(email, password);
				password = '';
				code = '';
				mode = 'verify';
				notice = `We sent a 6-digit code to ${email}.`;
			} else {
				if (mode === 'verify') await verifyEmail(email, code);
				else await signIn(email, password);
				password = '';
				code = '';
				auth = await getAuthState();
				await loadSessions();
			}
		} catch (e) {
			if (e instanceof NeedsVerification) {
				password = '';
				code = '';
				mode = 'verify';
				notice = e.message;
			} else {
				failure = e instanceof Error ? e.message : String(e);
			}
		} finally {
			busy = false;
		}
	}

	async function sendAgain() {
		failure = '';
		try {
			await resendCode(email);
			notice = 'If a code was due, a new one is on its way. Check your spam folder too.';
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
		}
	}

	async function leave() {
		await signOut();
		auth = await getAuthState();
		sessions = null;
		switchMode('signin');
	}

	const when = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<svelte:head><title>Your account · Godmother</title></svelte:head>

<div class="page">
	<nav class="nav" aria-label="Main">
		<Wordmark href="/" size={21} />
		<ThemeToggle />
	</nav>

	<main class="panel">
		{#if !auth}
			<p class="muted" aria-live="polite">Checking your account…</p>
		{:else if !auth.accounts}
			<h1 class="display">Guest only</h1>
			<p class="muted">
				Accounts aren’t set up on this server. You can still use Godmother as a guest.
			</p>
			<a class="btn btn-primary" href="/">Back to Godmother</a>
		{:else if auth.user}
			<h1 class="display">Your evenings</h1>
			<p class="muted">Signed in as {auth.user.email}</p>

			{#if units}
				<section class="units" aria-label="Your units">
					<p><b class="num">{units.balance}</b> units left</p>
					{#if units.canClaim}
						<button
							class="btn btn-primary btn-sm"
							type="button"
							disabled={claiming}
							onclick={claim}
						>
							{claiming ? 'One moment…' : 'Claim today’s 60 units'}
						</button>
						<p class="hint">This resets your balance to 60. Unused units don’t carry over.</p>
					{:else}
						<p class="hint">You can claim fresh units tomorrow.</p>
					{/if}
					{#if claimFailure}<p class="failure" role="alert">{claimFailure}</p>{/if}
				</section>
			{/if}

			{#if listFailure}
				<p class="failure" role="alert">{listFailure}</p>
			{:else if !sessions}
				<p class="muted" aria-live="polite">Loading your sessions…</p>
			{:else if sessions.length === 0}
				<p class="muted">No saved sessions yet. New sessions will appear here.</p>
			{:else}
				<ul class="list">
					{#each sessions as s (s.id)}
						<li>
							<a href={`/studio/${s.id}`}>
								<span class="name">{s.title ?? 'New evening'}</span>
								<span class="meta">{when(s.updatedAt)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="row">
				<a class="btn btn-primary" href="/">Back to Godmother</a>
				<button class="btn btn-secondary" type="button" onclick={leave}>Sign out</button>
			</div>
		{:else}
			<h1 class="display">
				{mode === 'signup'
					? 'Create your account'
					: mode === 'forgot'
						? 'Reset your password'
						: mode === 'verify'
							? 'Check your email'
							: 'Welcome back'}
			</h1>
			<p class="muted">
				{mode === 'forgot'
					? 'We’ll email you a link to choose a new password.'
					: mode === 'verify'
						? 'Enter the code to confirm this address. It expires in 15 minutes.'
						: 'Your sessions and photos stay with your account. Guest sessions from this browser move in when you sign in.'}
			</p>

			<form onsubmit={submit}>
				{#if mode === 'verify'}
					<label>
						Code
						<input
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							pattern="[0-9]{6}"
							maxlength="6"
							required
							bind:value={code}
						/>
					</label>
				{:else}
					<label>
						Email
						<input type="email" autocomplete="email" required bind:value={email} />
					</label>
				{/if}
				{#if mode === 'signin' || mode === 'signup'}
					<label>
						Password
						<input
							type="password"
							autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
							minlength={mode === 'signup' ? 10 : undefined}
							required
							bind:value={password}
						/>
						{#if mode === 'signup'}<span class="hint">At least 10 characters.</span>{/if}
					</label>
				{/if}

				{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
				{#if notice}<p class="notice" role="status">{notice}</p>{/if}

				<button class="btn btn-primary" type="submit" disabled={busy}>
					{busy
						? 'One moment…'
						: mode === 'signup'
							? 'Create account'
							: mode === 'forgot'
								? 'Send reset link'
								: mode === 'verify'
									? 'Confirm email'
									: 'Sign in'}
				</button>
			</form>

			<div class="switch">
				{#if mode === 'signin'}
					<button type="button" onclick={() => switchMode('signup')}>Create an account</button>
					{#if auth.passwordReset}
						<button type="button" onclick={() => switchMode('forgot')}>Forgot your password?</button
						>
					{/if}
				{:else}
					{#if mode === 'verify'}
						<button type="button" onclick={sendAgain}>Send a new code</button>
					{/if}
					<button type="button" onclick={() => switchMode('signin')}>Back to sign in</button>
				{/if}
				<a href="/">Continue as a guest</a>
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100dvh;
		padding: var(--space-5) var(--gutter) var(--space-9);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.panel {
		display: grid;
		gap: var(--space-4);
		max-width: 440px;
		margin: var(--space-9) auto 0;
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.15;
	}
	.muted {
		margin: 0;
		color: var(--text-2);
	}
	form {
		display: grid;
		gap: var(--space-4);
	}
	label {
		display: grid;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	input {
		padding: var(--space-3);
		font-size: var(--text-base);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.hint {
		color: var(--text-3);
	}
	.failure {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}
	.notice {
		margin: 0;
		color: var(--text);
		font-size: var(--text-sm);
	}
	.switch {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
	}
	.switch button,
	.switch a {
		padding: 0;
		color: var(--accent);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.units {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
	}
	.units p {
		margin: 0;
		color: var(--text);
	}
	.units .hint {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}
	.list a {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		color: var(--text);
		text-decoration: none;
		border-bottom: 1px solid var(--line);
	}
	.list a:hover .name {
		color: var(--accent);
	}
	.meta {
		flex: none;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
