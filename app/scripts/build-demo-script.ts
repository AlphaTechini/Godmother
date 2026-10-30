// Generates app/demo/script.json (the illustrated demo) from the UI fixtures.
// Run: pnpm demo:build
//
// The story: the Eko Heritage Ball in Lagos, black tie. Seven beats, ~70 s of playback:
//   greeting -> event -> photos -> three looks -> decide -> revise -> finish -> shopping list.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	assets,
	decision as fxDecision,
	event as fxEvent,
	face as fxFace,
	location as fxLocation,
	lookbook as fxLookbook,
	looks as fxLooks,
	shoppingList as fxShoppingList,
	wardrobe as fxWardrobe
} from '../src/lib/client/fixtures';
import {
	checkSuggestionChain,
	turnDurationMs,
	type DemoEvent,
	type DemoScript,
	type DemoTurn
} from '../src/lib/server/demo/script';
import type {
	AccessoryResult,
	Block,
	ChatMessage,
	Look,
	LookPiece,
	Lookbook,
	Money,
	Product,
	RenderStep,
	SessionSnapshot,
	ShoppingItem,
	UnitLedgerEntry
} from '../src/lib/types';

const GREETING_ID = 'greeting';
const A = '$assistant';
const clone = <T>(v: T): T => structuredClone(v);

/* ------------------------------------------------------------ turn builder */

/** Words per text_delta frame and the gap between them, so text feels live. */
const CHUNK_MS = 25;

class TurnBuilder {
	readonly events: DemoEvent[] = [];
	/** Cursor in ms from the start of the turn. */
	t = 0;

	at(ms: number): this {
		this.t = ms;
		return this;
	}
	wait(ms: number): this {
		this.t += ms;
		return this;
	}
	private push(event: DemoEvent['event']): this {
		this.events.push({ at: Math.round(this.t), event });
		return this;
	}
	activity(
		id: string,
		label: string,
		status: 'running' | 'done' | 'failed',
		detail?: string
	): this {
		return this.push({ type: 'activity', id, label, status, ...(detail ? { detail } : {}) });
	}
	/** Streams text in word-sized chunks, CHUNK_MS apart, advancing the cursor. */
	text(text: string): this {
		for (const chunk of text.match(/\S+\s*|\s+/g) ?? []) {
			this.push({ type: 'text_delta', messageId: A, delta: chunk });
			this.t += CHUNK_MS;
		}
		return this;
	}
	block(block: Block): this {
		return this.push({ type: 'block', messageId: A, block });
	}
	session(snapshot: SessionSnapshot): this {
		return this.push({ type: 'session', session: clone(snapshot) });
	}
	/** Events are authored with an absolute cursor; sort stably by time. */
	done(user: DemoTurn['user']): DemoTurn {
		const events = this.events
			.map((e, i) => ({ e, i }))
			.sort((a, b) => a.e.at - b.e.at || a.i - b.i)
			.map(({ e }) => e);
		return { user, events };
	}
}

/* ------------------------------------------------------------- story state */

const ngn = (amount: number): Money => ({ amount, currency: 'NGN' });
const money = (m: Money) => `₦${m.amount.toLocaleString('en-NG')}`;

const base: SessionSnapshot = {
	id: 'demo',
	createdAt: '2026-10-30T09:00:00.000Z',
	mode: 'demo',
	stage: 'event',
	photos: {},
	wardrobe: [],
	looks: [],
	units: { spent: 0, cap: 60, ledger: [] }
};
const state: SessionSnapshot = clone(base);
const snap = (): SessionSnapshot => clone(state);

let ledgerClock = Date.parse('2026-10-30T09:00:00Z');
function spend(feature: string, units: number, seconds: number): UnitLedgerEntry {
	const entry: UnitLedgerEntry = {
		at: new Date((ledgerClock += 20000)).toISOString(),
		feature,
		units,
		ok: true,
		seconds,
		taskId: `demo_task_${String(state.units.ledger.length + 1).padStart(3, '0')}`
	};
	state.units.ledger.push(entry);
	state.units.spent += units;
	return entry;
}

/** Looks as the story needs them: one 2-unit gown try-on each (units mirror a live run). */
const storyLooks: Look[] = clone(fxLooks).map((look) => ({
	...look,
	render: {
		status: 'done',
		image: look.render.image,
		seconds: look.render.seconds,
		steps: [{ label: 'Gown', status: 'done', units: 2, seconds: look.render.seconds }]
	}
}));

const rendering = (look: Look): Look => ({
	...clone(look),
	render: {
		status: 'rendering',
		steps: [{ label: 'Gown', status: 'rendering', units: 2 }]
	}
});

const setLook = (id: string, look: Look) => {
	state.looks = state.looks.map((l) => (l.id === id ? clone(look) : l));
};

const products = (): Product[] => {
	const seen = new Set<string>();
	const out: Product[] = [];
	for (const look of storyLooks) {
		for (const piece of look.pieces) {
			if (piece.source.type !== 'product') continue;
			const p = piece.source.product;
			if (seen.has(p.url)) continue;
			seen.add(p.url);
			out.push(clone(p));
		}
	}
	return out;
};

/* ----------------------------------------------------------------- the story */

const EVENT_NAME = fxEvent.name;
const EVENT_DAY = '14 November';

const TEXT = {
	greeting:
		'Hello, I’m Godmother. Tell me about the event you need to dress for: its name, a link, or a photo of the invitation. I’ll look up the dress code, colours and venue, find real pieces in local shops, try them on you, and make the final call easy.\n\nYou’re in demo mode, so this is a saved run: no photos leave your device and no credits are spent.',
	named: `I’m going to ${EVENT_NAME.replace(/^The /, 'the ')} in Lagos on ${EVENT_DAY}`,
	photos:
		'Here are my photos. I’d like to buy something new, and I have gold heels and an emerald ring.',
	decide: 'Decide for me',
	revise: 'Love it, but I’d rather wear my own gold heels',
	finish: 'Finish this look',
	shopping: 'Build my shopping list'
};

function greeting(): ChatMessage {
	return {
		id: GREETING_ID,
		role: 'assistant',
		createdAt: '2026-10-30T09:00:00.000Z',
		text: TEXT.greeting,
		attachments: [],
		blocks: [
			{
				type: 'suggestions',
				options: [TEXT.named, 'I have an invitation to upload', 'It’s a wedding in two weeks']
			}
		]
	};
}

/* Turn 1: the event */
function turnEvent(): DemoTurn {
	const b = new TurnBuilder();
	b.at(0).activity('search', `Searching the web for ${EVENT_NAME} 2026`, 'running');
	b.at(900).activity('guest', 'Reading the guest guidance', 'running');
	b.at(1800).activity(
		'search',
		`Searching the web for ${EVENT_NAME} 2026`,
		'done',
		'3 sources found'
	);
	b.at(2500).activity('guest', 'Reading the guest guidance', 'done', 'Black tie, emerald and gold');
	b.at(2700).text(
		`Found it. **${EVENT_NAME}** is on Saturday ${EVENT_DAY} at the Grand Ballroom on Victoria Island, and the guest guidance is clear: **black tie**, with emerald and gold encouraged and gele and aso-oke welcome.\n\nBlack tie settles the shape of everything that follows: floor length, evening fabrics, nothing casual. Within that I’ll lean into the emerald and gold, and into Lagos.\n\nNext I need to see you. Three photos, each for a different part of the look:`
	);
	b.wait(300).block({ type: 'event', event: clone(fxEvent) });
	state.stage = 'photos';
	state.event = clone(fxEvent);
	state.location = { ...clone(fxLocation), source: 'typed' };
	b.wait(200).session(snap());
	b.wait(500).block({
		type: 'photo_request',
		slots: ['fullBody', 'portrait', 'hand'],
		reason:
			'Clothes go on your full-body photo, makeup and hair on your portrait, and the watch and ring on your hand.'
	});
	b.wait(400).block({
		type: 'suggestions',
		options: [TEXT.photos, 'Can I skip the hand photo?', 'I’d rather have something sewn']
	});
	return b.done({ text: TEXT.named, attachments: [] });
}

/* Turn 2: photos -> products -> three looks */
/** Offsets after the intro text, each under the player's 4 s wait cap. */
const LOOK_DONE_AFTER = [3800, 7500, 11200];

function turnLooks(): DemoTurn {
	const b = new TurnBuilder();
	const list = products();
	const shops = new Set(list.map((p) => p.shop));

	b.at(0).activity('photos', 'Looking at your photos', 'running');
	state.photos = {
		fullBody: clone(assets.uploadFull),
		portrait: clone(assets.uploadPortrait),
		hand: clone(assets.uploadHand)
	};
	state.wardrobe = clone(fxWardrobe);
	b.at(1300).activity(
		'photos',
		'Looking at your photos',
		'done',
		'Full body, portrait and hand are clear'
	);
	b.at(1300).session(snap());
	b.at(600).activity('shops', 'Searching Lagos shops for gowns and jewellery', 'running');
	b.at(3300).activity(
		'shops',
		'Searching Lagos shops for gowns and jewellery',
		'done',
		`${list.length} pieces from ${shops.size} shops`
	);
	b.at(3500).block({ type: 'products', products: list });
	b.at(3800).text(
		'Thank you, these are perfect. I’ve kept your **gold heels** and **emerald ring** in play, searched Lagos shops for the rest, and designed one gown for a tailor.\n\nHere are three complete looks. I’m trying each on you now:\n\n1. **The Emerald Column**: made to measure, the most black tie of the three.\n2. **Gold Hour**: sequins and an emerald gele, full celebration.\n3. **Midnight Velvet**: classic black with the theme colour as a wrap.'
	);
	const textEnd = b.t;

	state.stage = 'looks';
	state.looks = storyLooks.map(rendering);
	b.at(textEnd + 200).block({ type: 'wardrobe', itemIds: fxWardrobe.map((w) => w.id) });
	b.at(textEnd + 300).session(snap());

	storyLooks.forEach((look, i) => {
		const id = `look-${look.index}`;
		const label = `Trying look ${look.index} on you: ${look.title}`;
		b.at(textEnd + 400).activity(id, label, 'running');
		const doneAt = textEnd + LOOK_DONE_AFTER[i];
		b.at(doneAt).activity(id, label, 'done', `${look.render.seconds}s`);
		spend(`Clothes try-on · look ${look.index}`, 2, look.render.seconds ?? 40);
		setLook(look.id, look);
		b.at(doneAt + 50).session(snap());
	});

	const end = textEnd + LOOK_DONE_AFTER[2] + 300;
	b.at(end).block({ type: 'looks', lookIds: storyLooks.map((l) => l.id) });
	b.at(end + 200).text('All three are ready. Tell me what you don’t like, or let me decide.');
	b.wait(300).block({
		type: 'suggestions',
		options: [TEXT.decide, 'Show me something less formal', 'Make look 2 less sparkly']
	});
	return b.done({
		text: TEXT.photos,
		attachments: [
			{ asset: clone(assets.uploadFull), purpose: 'fullBody' },
			{ asset: clone(assets.uploadPortrait), purpose: 'portrait' },
			{ asset: clone(assets.uploadHand), purpose: 'hand' }
		]
	});
}

/* Turn 3: decide for me */
function turnDecide(): DemoTurn {
	const b = new TurnBuilder();
	b.at(0).activity('weigh', 'Weighing the three looks', 'running');
	b.at(3000).activity(
		'weigh',
		'Weighing the three looks',
		'done',
		'Dress code, colours, camera, comfort'
	);
	b.at(3200).text(
		'I’d wear **The Emerald Column**.\n\nIt is the most black tie of the three and it wears the ball’s own colours. With a clean line like this, your face and the jewellery do the talking, which is exactly where we’re going next.'
	);
	state.stage = 'chosen';
	state.decision = clone(fxDecision);
	state.chosenLookId = fxDecision.lookId;
	b.wait(200).block({ type: 'decision', decision: clone(fxDecision) });
	b.wait(100).session(snap());
	b.wait(400).block({
		type: 'suggestions',
		options: [TEXT.revise, 'Show me something in ivory', 'Actually, I prefer Gold Hour']
	});
	return b.done({ text: TEXT.decide, attachments: [], action: { type: 'decide_for_me' } });
}

/* Turn 4: a revision (version 2, no new try-on needed) */
function turnRevise(): DemoTurn {
	const b = new TurnBuilder();
	const heels = fxWardrobe.find((w) => w.role === 'shoes');
	if (!heels) throw new Error('fixtures: no shoes in the wardrobe');
	const chosen = state.looks.find((l) => l.id === state.chosenLookId);
	if (!chosen) throw new Error('story: no chosen look');
	const revised: Look = {
		...clone(chosen),
		version: 2,
		summary: 'Emerald duchesse-satin column with a gold self-belt and your own gold heels.',
		pieces: chosen.pieces.map((p): LookPiece =>
			p.role === 'shoes'
				? {
						id: p.id,
						role: 'shoes',
						name: 'Your gold block-heel sandals',
						colorHex: '#C9A25A',
						source: { type: 'wardrobe', wardrobeItemId: heels.id },
						image: clone(heels.image)
					}
				: p
		)
	};
	const swapped = chosen.pieces.find((p) => p.role === 'shoes');
	const saved =
		swapped?.source.type === 'product' && swapped.source.product.price
			? ` and keeps ${money(swapped.source.product.price)} in your pocket`
			: '';

	b.at(0).activity('revise', 'Updating The Emerald Column', 'running');
	b.at(2400).activity('revise', 'Updating The Emerald Column', 'done', 'Version 2');
	b.at(2600).text(
		`Good call. Your gold block-heel sandals already match the antique gold of the belt${saved}.\n\nI’ve swapped them in. The gown itself hasn’t changed, so it needs no new try-on; you’ll see the heels on you in the finishing step.`
	);
	setLook(revised.id, revised);
	b.wait(200).block({ type: 'looks', lookIds: [revised.id] });
	b.wait(100).session(snap());
	b.wait(400).block({
		type: 'suggestions',
		options: [TEXT.finish, 'Show me the alternatives again']
	});
	return b.done({ text: TEXT.revise, attachments: [] });
}

/* Turn 5: finishing touches */
type StepDef = { key: string; label: string; units: number; seconds: number };
const STEPS: StepDef[] = [
	{ key: 'face', label: 'Face analysis', units: 30, seconds: 9 },
	{ key: 'shoes', label: 'Gold heels', units: 2, seconds: 31 },
	{ key: 'makeup', label: 'Makeup', units: 1, seconds: 14 },
	{ key: 'hair', label: 'Hairstyle', units: 2, seconds: 27 },
	{ key: 'earrings', label: 'Earrings', units: 1, seconds: 12 },
	{ key: 'necklace', label: 'Necklace', units: 1, seconds: 11 },
	{ key: 'watch', label: 'Watch', units: 1, seconds: 13 },
	{ key: 'ring', label: 'Ring', units: 1, seconds: 12 }
];

function turnFinish(): DemoTurn {
	const b = new TurnBuilder();
	const lookId = state.chosenLookId;
	const look = state.looks.find((l) => l.id === lookId);
	if (!lookId || !look) throw new Error('story: no chosen look');
	const piece = (role: LookPiece['role']): LookPiece => {
		const p = look.pieces.find((x) => x.role === role);
		if (!p) throw new Error(`story: look has no ${role}`);
		return p;
	};

	const doneSteps = new Set<string>();
	const active = new Set<string>();
	const steps = (): RenderStep[] =>
		STEPS.map((s) => ({
			label: s.label,
			units: s.units,
			status: doneSteps.has(s.key) ? 'done' : active.has(s.key) ? 'rendering' : 'pending',
			...(doneSteps.has(s.key) ? { seconds: s.seconds } : {})
		}));
	const lookbook: Lookbook = { lookId, accessories: [], steps: steps() };
	const refresh = () => {
		lookbook.steps = steps();
		state.lookbook = clone(lookbook);
	};
	const acc = (role: 'earrings' | 'necklace' | 'watch' | 'ring'): AccessoryResult => ({
		piece: clone(piece(role)),
		image: clone(role === 'earrings' || role === 'necklace' ? assets.finalFace : assets.finalHand),
		panel: role === 'earrings' || role === 'necklace' ? 'portrait' : 'hand'
	});

	state.stage = 'finishing';
	active.add('face');
	refresh();
	b.at(0).session(snap());
	b.at(200).activity('face', 'Reading your skin tone and face shape', 'running');
	b.at(3800).activity(
		'face',
		'Reading your skin tone and face shape',
		'done',
		'Warm undertone, oval face'
	);
	doneSteps.add('face');
	active.delete('face');
	state.face = clone(fxFace);
	spend('Facial colour tones', 20, 5);
	spend('Face attributes', 10, 4);
	refresh();
	b.at(3850).session(snap());
	b.at(3900).block({ type: 'face_profile', profile: clone(fxFace) });
	b.at(4200).text(
		'Deep, warm skin and an oval face: bronze and berry will glow on you. Now putting it all on you.'
	);
	let t = b.t + 300;

	/** One finishing step: running activity, then done with a session snapshot. */
	const step = (
		key: string,
		label: string,
		duration: number,
		detail: string,
		apply: () => void,
		feature: string
	) => {
		const def = STEPS.find((s) => s.key === key);
		if (!def) throw new Error(`story: unknown step ${key}`);
		active.add(key);
		refresh();
		b.at(t).activity(key, label, 'running');
		b.at(t + 20).session(snap());
		t += duration;
		active.delete(key);
		doneSteps.add(key);
		apply();
		spend(feature, def.units, def.seconds);
		refresh();
		b.at(t).activity(key, label, 'done', detail);
		b.at(t + 30).session(snap());
		t += 150;
	};

	step(
		'shoes',
		'Putting your gold heels on you',
		3800,
		'Full look',
		() => {
			lookbook.full = clone(assets.finalFull);
		},
		'Shoes try-on'
	);
	step(
		'makeup',
		'Choosing makeup for your skin tone',
		3200,
		fxLookbook.makeup?.name ?? 'Makeup',
		() => {
			lookbook.makeup = clone(fxLookbook.makeup);
			lookbook.face = clone(assets.finalFace);
		},
		'Makeup try-on'
	);
	step(
		'hair',
		'Trying a sculpted high bun',
		3800,
		fxLookbook.hair?.templateName ?? 'Hairstyle',
		() => {
			lookbook.hair = clone(fxLookbook.hair);
		},
		'Hairstyle'
	);
	step(
		'earrings',
		'Adding the emerald drop earrings',
		2600,
		'On your portrait',
		() => {
			lookbook.accessories.push(acc('earrings'));
		},
		'Earrings'
	);
	step(
		'necklace',
		'Adding the pendant necklace',
		2600,
		'On your portrait',
		() => {
			lookbook.accessories.push(acc('necklace'));
		},
		'Necklace'
	);
	step(
		'watch',
		'Fastening the gold mesh watch',
		2600,
		'On your hand',
		() => {
			lookbook.accessories.push(acc('watch'));
			lookbook.hand = clone(assets.finalHand);
		},
		'Watch'
	);
	step(
		'ring',
		'Slipping on your emerald ring',
		2600,
		'On your hand',
		() => {
			lookbook.accessories.push(acc('ring'));
		},
		'Ring'
	);

	b.at(t).text(
		'Your lookbook is ready: The Emerald Column with your gold heels, a bronze glow and berry lip, a sculpted high bun, emerald drops, a pendant, the mesh watch and your ring.'
	);
	b.wait(300).block({ type: 'lookbook', lookId });
	b.wait(400).block({
		type: 'suggestions',
		options: [TEXT.shopping, 'Try a different hairstyle', 'Send me the makeup steps']
	});
	return b.done({
		text: TEXT.finish,
		attachments: [],
		action: { type: 'finish_look', lookId }
	});
}

/* Turn 6: shopping list */
function turnShopping(): DemoTurn {
	const b = new TurnBuilder();
	const look = state.looks.find((l) => l.id === state.chosenLookId);
	if (!look) throw new Error('story: no chosen look');
	// The fixture list, minus anything the user already owns in the revised look.
	const ownedShoes = look.pieces.some((p) => p.role === 'shoes' && p.source.type === 'wardrobe');
	const items: ShoppingItem[] = clone(fxShoppingList.items).filter(
		(i) => !(ownedShoes && i.role === 'shoes')
	);
	const low = items.reduce((s, i) => s + (i.price ?? i.estimate?.min)!.amount, 0);
	const high = items.reduce((s, i) => s + (i.price ?? i.estimate?.max)!.amount, 0);
	const list = {
		...clone(fxShoppingList),
		items,
		total: { min: ngn(low), max: ngn(high) },
		note: 'Only covers pieces you didn’t upload from your wardrobe. Your emerald ring and gold heels are already yours.'
	};

	b.at(0).activity('prices', 'Checking prices and adding it all up', 'running');
	b.at(3000).activity(
		'prices',
		'Checking prices and adding it all up',
		'done',
		`${items.length} pieces`
	);
	state.stage = 'done';
	state.shoppingList = list;
	b.at(3200).block({ type: 'shopping_list' });
	b.wait(100).session(snap());
	b.wait(300).text(
		`That’s everything you still need: about ${money(ngn(low))} to ${money(ngn(high))} in total, with the gown as the only made-to-measure piece. Your heels and ring are already yours. Prices were checked today, and each piece links to its shop.`
	);
	b.wait(400).block({
		type: 'suggestions',
		options: ['Find a cheaper watch', 'Which tailor should I use?', 'Send me the makeup steps']
	});
	return b.done({ text: TEXT.shopping, attachments: [], action: { type: 'shopping_list' } });
}

/* ------------------------------------------------------------------- build */

export function buildDemoScript(): DemoScript {
	Object.assign(state, clone(base));
	ledgerClock = Date.parse('2026-10-30T09:00:00Z');
	const turns = [
		turnEvent(),
		turnLooks(),
		turnDecide(),
		turnRevise(),
		turnFinish(),
		turnShopping()
	];
	return {
		version: 1,
		title: `${EVENT_NAME}, Lagos (illustrated demo)`,
		initial: { stage: 'event', photos: {}, wardrobe: [], looks: [], messages: [greeting()] },
		turns
	};
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const script = buildDemoScript();
	const problems = checkSuggestionChain(script);
	if (problems.length) {
		console.error('The demo script is inconsistent:\n- ' + problems.join('\n- '));
		process.exit(1);
	}
	const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'script.json');
	await mkdir(dirname(out), { recursive: true });
	await writeFile(out, JSON.stringify(script, null, 1) + '\n');
	const durations = script.turns.map((t) => turnDurationMs(t) / 1000);
	const final = script.turns.at(-1)?.events.findLast((e) => e.event.type === 'session');
	const spent = final?.event.type === 'session' ? final.event.session.units.spent : 0;
	console.log(`Wrote ${out}`);
	console.log(`${script.title}: ${script.turns.length} turns`);
	durations.forEach((d, i) =>
		console.log(`  turn ${i + 1}: ${d.toFixed(1)} s, ${script.turns[i].events.length} events`)
	);
	console.log(
		`Playback ~${durations.reduce((a, b) => a + b, 0).toFixed(0)} s, ${spent} units shown as spent (nothing is charged).`
	);
}
