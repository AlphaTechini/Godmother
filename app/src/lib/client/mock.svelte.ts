// A purely client-side Transport for /studio/mock: simulates the server's turn stream
// (messages, streamed text, activities, blocks, session snapshots) from fixtures, with
// realistic pacing, so the whole flow is clickable without a backend.
import type {
	Asset,
	AttachmentPurpose,
	Block,
	ChatMessage,
	Id,
	PhotoSlot,
	Session,
	SessionSnapshot,
	StreamEvent
} from '#lib/types';
import type { Transport, TurnBody } from './api';
import * as fx from './fixtures';

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(t);
			reject(new DOMException('Aborted', 'AbortError'));
		});
	});

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/** Simulated backend bound to one in-memory session. */
export function mockTransport(getSession: () => Session, speed = 1): Transport {
	const uploads = new Map<Id, Asset>();

	return {
		async upload(_id, file, purpose: AttachmentPurpose) {
			await sleep(500 * speed);
			const asset: Asset = {
				id: nid('asset'),
				url: URL.createObjectURL(file),
				kind: 'upload',
				mime: file.type || 'image/*',
				label: file.name
			};
			uploads.set(asset.id, asset);
			return asset;
		},

		async *turn(_id, body: TurnBody, signal) {
			const wait = (ms: number) => sleep(ms * speed, signal);
			const s = snapshotOf(getSession());
			const userMsg: ChatMessage = {
				id: nid('msg'),
				role: 'user',
				createdAt: new Date().toISOString(),
				text: body.text,
				attachments: body.attachments.map((a) => ({
					purpose: a.purpose,
					asset: uploads.get(a.assetId) ?? {
						id: a.assetId,
						url: `/api/assets/${a.assetId}`,
						kind: 'upload',
						mime: 'image/*'
					}
				})),
				blocks: []
			};
			for (const a of userMsg.attachments) {
				if (['fullBody', 'portrait', 'hand'].includes(a.purpose)) {
					s.photos[a.purpose as PhotoSlot] = a.asset;
				}
			}
			const reply: ChatMessage = {
				id: nid('msg'),
				role: 'assistant',
				createdAt: new Date().toISOString(),
				text: '',
				attachments: [],
				blocks: []
			};
			yield { type: 'message', message: userMsg };
			await wait(250);
			yield { type: 'message', message: reply };

			const mid = reply.id;
			async function* say(text: string): AsyncGenerator<StreamEvent> {
				const parts = text.match(/\S+\s*|\s+/g) ?? [];
				for (const p of parts) {
					await wait(p.includes('\n') ? 70 : 22 + Math.random() * 26);
					yield { type: 'text_delta', messageId: mid, delta: p };
				}
			}
			async function* activity(label: string, ms: number, detail?: string): AsyncGenerator<StreamEvent> {
				const id = nid('act');
				yield { type: 'activity', id, label, status: 'running', detail };
				await wait(ms);
				yield { type: 'activity', id, label, status: 'done', detail };
			}
			const block = (b: Block): StreamEvent => ({ type: 'block', messageId: mid, block: b });
			const snap = (): StreamEvent => ({ type: 'session', session: structuredClone(s) });
			const text = body.text.toLowerCase();
			const action = body.action?.type;

			if (s.stage === 'event') {
				yield* activity(`Searching the web for “${body.text.slice(0, 48) || 'your event'}”`, 1400);
				yield* activity('Reading the official page and guest guidance', 1100, 'example.com');
				s.event = structuredClone(fx.event);
				s.location = structuredClone(fx.location);
				s.stage = 'photos';
				yield snap();
				yield* say(fx.conversation.photos[1].text);
				yield block({ type: 'event', event: fx.event });
				await wait(300);
				yield block(fx.conversation.photos[1].blocks[1]);
				yield block({ type: 'suggestions', options: ['I’ve attached all three photos', 'Can I skip the hand photo?'] });
			} else if (s.stage === 'photos') {
				const missing = (['fullBody', 'portrait', 'hand'] as PhotoSlot[]).filter((k) => !s.photos[k]);
				if (missing.length && !text.includes('demo')) {
					yield* say(
						`Almost there. I still need your **${missing.map((m) => ({ fullBody: 'full-body photo', portrait: 'portrait', hand: 'hand photo' })[m]).join('** and **')}**. You can drop them on the canvas or attach them here.`
					);
					yield block({ type: 'photo_request', slots: missing, reason: 'Each photo is used for a different part of the look.' });
					yield block({ type: 'suggestions', options: ['Use the demo photos'] });
				} else {
					s.photos = { fullBody: fx.assets.uploadFull, portrait: fx.assets.uploadPortrait, hand: fx.assets.uploadHand, ...s.photos };
					s.wardrobe = structuredClone(fx.wardrobe);
					yield snap();
					yield* activity('Checking your photos against YouCam’s requirements', 900);
					yield* activity('Searching Lagos shops for emerald and gold eveningwear', 1600, '14 listings, 6 shortlisted');
					yield* activity('Designing a made-to-measure gown for your tailor', 1200);
					s.looks = fx.variants.looksPending();
					s.stage = 'looks';
					yield snap();
					for (let i = 0; i < 3; i++) {
						const id = nid('act');
						const label = `Trying look ${i + 1} on you`;
						yield { type: 'activity', id, label, status: 'running', detail: 'Clothes try-on · 2 units' };
						s.looks[i].render = { status: 'rendering', steps: [{ label: 'Gown', status: 'rendering', units: 2 }] };
						yield snap();
						await wait(1500);
						s.looks[i] = structuredClone(fx.looks[i]);
						s.units.spent += 2;
						s.units.ledger.push({ at: new Date().toISOString(), feature: `Clothes try-on · look ${i + 1}`, units: 2, ok: true, seconds: 40 });
						yield snap();
						yield { type: 'activity', id, label, status: 'done', detail: 'Clothes try-on · 2 units' };
					}
					yield* say(fx.conversation.looks[1].text);
					yield block({ type: 'looks', lookIds: s.looks.map((l) => l.id) });
					yield block({ type: 'suggestions', options: ['Decide for me', 'Less sequins on look 2'] });
				}
			} else if (s.stage === 'looks' || (s.stage === 'chosen' && (action === 'choose_look' || action === 'decide_for_me'))) {
				if (action === 'decide_for_me' || text.includes('decide')) {
					yield* activity('Weighing the three looks against black tie and the theme', 1600);
					s.decision = structuredClone(fx.decision);
					s.chosenLookId = fx.decision.lookId;
					s.stage = 'chosen';
					yield snap();
					yield* say(fx.conversation.chosen[1].text);
					yield block({ type: 'decision', decision: fx.decision });
					yield block({ type: 'suggestions', options: ['Finish this look', 'Actually, I prefer Gold Hour'] });
				} else if (body.action?.type === 'choose_look') {
					const id = body.action.lookId;
					const look = s.looks.find((l) => l.id === id);
					s.chosenLookId = id;
					s.stage = 'chosen';
					yield snap();
					yield* say(`Lovely choice. **${look?.title ?? 'That look'}** it is. Shall I finish it with makeup, hair and jewellery?`);
					yield block({ type: 'suggestions', options: ['Finish this look'] });
				} else {
					const target = s.looks.find((l) => text.includes(String(l.index))) ?? s.looks[1];
					yield* activity(`Revising look ${target.index}: “${body.text.slice(0, 40)}”`, 1300);
					const i = s.looks.indexOf(target);
					s.looks[i].render = { status: 'rendering', steps: [{ label: 'Gown', status: 'rendering', units: 2 }] };
					yield snap();
					await wait(1700);
					s.looks[i] = { ...structuredClone(fx.looks[i]), version: target.version + 1, summary: `${fx.looks[i].summary} Revised: ${body.text}` };
					s.units.spent += 2;
					yield snap();
					yield* say(`Done. I revised **${target.title}** with that in mind and tried it on you again. The other two looks are unchanged.`);
					yield block({ type: 'looks', lookIds: [target.id] });
					yield block({ type: 'suggestions', options: ['Decide for me'] });
				}
			} else if (s.stage === 'chosen' || (s.stage === 'finishing' && !s.lookbook)) {
				yield* activity('Analysing your skin tone and face shape', 1300, 'Face analysis · 30 units');
				s.face = structuredClone(fx.face);
				s.units.spent += 30;
				s.stage = 'finishing';
				const lb = fx.variants.lookbookInProgress();
				lb.steps = lb.steps.map((st) => ({ ...st, status: 'pending' as const }));
				s.lookbook = lb;
				yield snap();
				yield* say(fx.conversation.finishing[1].text);
				yield block({ type: 'face_profile', profile: fx.face });
				yield block({ type: 'lookbook', lookId: s.chosenLookId ?? 'look-1' });
				for (let i = 0; i < lb.steps.length; i++) {
					lb.steps[i].status = 'rendering';
					const id = nid('act');
					yield { type: 'activity', id, label: `Adding ${lb.steps[i].label.toLowerCase()}`, status: 'running' };
					yield snap();
					await wait(i === 0 ? 300 : 650);
					lb.steps[i] = { ...lb.steps[i], status: 'done', seconds: 12 };
					if (i === 2) s.lookbook.makeup = structuredClone(fx.lookbook.makeup);
					if (i === 3) {
						s.lookbook.hair = structuredClone(fx.lookbook.hair);
						s.lookbook.face = fx.assets.finalFace;
					}
					if (i === 7) {
						s.lookbook.hand = fx.assets.finalHand;
						s.lookbook.accessories = structuredClone(fx.lookbook.accessories);
					}
					s.units.spent += i === 0 ? 0 : (lb.steps[i].units ?? 1);
					yield snap();
					yield { type: 'activity', id, label: `Adding ${lb.steps[i].label.toLowerCase()}`, status: 'done' };
				}
				s.lookbook = structuredClone(fx.lookbook);
				yield snap();
				yield block({ type: 'suggestions', options: ['Build my shopping list'] });
			} else if (s.stage === 'finishing' || action === 'shopping_list') {
				yield* activity('Re-checking prices at 4 shops', 1500, 'Prices in NGN');
				yield* activity('Estimating tailoring in Lagos', 900);
				s.shoppingList = structuredClone(fx.shoppingList);
				s.stage = 'done';
				yield snap();
				yield* say(fx.conversation.done[0].text);
				yield block({ type: 'shopping_list' });
				yield block({ type: 'suggestions', options: ['Find a cheaper watch', 'Which tailor should I use?'] });
			} else {
				if (text.includes('fail')) {
					yield* activity('Looking for a cheaper watch', 900);
					yield { type: 'error', message: 'The shop search timed out. Nothing was charged; try again in a moment.' };
				} else {
					yield* say('Happy to. In the full app I’d search again and update your shopping list; this offline preview stops here. Try **Decide for me**, revisions, or upload photos at earlier stages.');
				}
			}
			await wait(120);
			yield { type: 'done' };
		}
	};
}

/** A plain, mutable copy of the session without messages ($state proxies can't be structuredClone'd). */
function snapshotOf(session: Session): SessionSnapshot {
	const { messages: _m, ...rest } = $state.snapshot(session) as Session;
	void _m;
	return rest;
}
