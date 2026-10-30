// View state for one open studio (which canvas section is showing, the mobile tab,
// the composer draft). Shared with descendants through context.
import { createContext } from 'svelte';
import type { Session } from '#lib/types';
import type { SessionClient } from './session.svelte';

export type CanvasView = 'brief' | 'photos' | 'looks' | 'lookbook' | 'shopping';

export const CANVAS_VIEWS: { view: CanvasView; label: string }[] = [
	{ view: 'brief', label: 'Brief' },
	{ view: 'photos', label: 'Photos' },
	{ view: 'looks', label: 'Looks' },
	{ view: 'lookbook', label: 'Lookbook' },
	{ view: 'shopping', label: 'Shopping' }
];

/** The section that best represents where the session is now. */
export function viewForStage(s: Session): CanvasView {
	switch (s.stage) {
		case 'event':
			return 'brief';
		case 'photos':
			return 'photos';
		case 'looks':
		case 'chosen':
			return 'looks';
		case 'finishing':
			return s.lookbook ? 'lookbook' : 'looks';
		case 'done':
			return s.shoppingList ? 'shopping' : 'lookbook';
	}
}

export function viewAvailable(s: Session, v: CanvasView): boolean {
	switch (v) {
		case 'brief':
			return true;
		case 'photos':
			return s.stage !== 'event' || Object.keys(s.photos).length > 0;
		case 'looks':
			return s.looks.length > 0;
		case 'lookbook':
			return !!s.lookbook;
		case 'shopping':
			return !!s.shoppingList;
	}
}

export class StudioUI {
	/** null = follow the session's stage automatically. */
	pinned: CanvasView | null = $state(null);
	tab: 'chat' | 'canvas' = $state('chat');
	draft = $state('');
	/** Set when the canvas changed while the mobile chat tab was showing. */
	canvasFresh = $state(false);
	/** Registered by the composer so other parts of the UI can focus it. */
	focusComposer: () => void = () => {};
	/** Registered by the composer: open the file picker for a purpose. */
	attach: (purpose: import('#lib/types').AttachmentPurpose) => void = () => {};

	constructor(public client: SessionClient) {}

	get view(): CanvasView {
		const s = this.client.session;
		if (this.pinned && viewAvailable(s, this.pinned)) return this.pinned;
		return viewForStage(s);
	}

	show(v: CanvasView) {
		const s = this.client.session;
		// Choosing the stage's own view resumes auto-follow.
		this.pinned = v === viewForStage(s) ? null : v;
		this.tab = 'canvas';
		this.canvasFresh = false;
	}

	/** Send text (and optionally an action) from anywhere in the studio. */
	say(text: string, action?: import('#lib/types').UserAction) {
		this.pinned = null;
		return this.client.send({ text, action });
	}

	prefill(text: string) {
		this.draft = text;
		this.tab = 'chat';
		queueMicrotask(() => this.focusComposer());
	}
}

export const [getStudio, setStudio] = createContext<StudioUI>();
