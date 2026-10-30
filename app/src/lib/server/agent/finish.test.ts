import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);
vi.mock('#lib/server/youcam', async () => (await import('./test-helpers')).youcamMockModule());

import * as youcam from '#lib/server/youcam';
import { ToolError } from './tools/types';
import { analyzeFaceTool, finishLook, listHairstyles } from './tools/finishing';
import {
	addWardrobe,
	blocksOf,
	installYoucamDefaults,
	makeAsset,
	makeEnv,
	renderedLook,
	sessionWithPhotos
} from './test-helpers';
import { newId } from './state';
import type { Session } from '#lib/types';

const yc = youcam as unknown as ReturnType<typeof import('./test-helpers').youcamMockModule>;

const MAKEUP = {
	name: 'Warm bronze glow',
	rationale: 'Warm undertone and a gold dress.',
	palette: [{ name: 'bronze', hex: '#b5651d' }],
	effects: [
		{
			category: 'foundation',
			palettes: [{ color: '#C68E6E', colorIntensity: 40, glowIntensity: 20, coverageIntensity: 50 }]
		},
		{
			category: 'lip_color',
			shape: { name: 'original' },
			style: { type: 'full' },
			palettes: [{ color: '#8E1B2C', texture: 'matte', colorIntensity: 85 }]
		}
	],
	steps: [
		{
			area: 'Base',
			product: 'Light foundation',
			colorHex: null,
			instruction: 'Blend with a sponge.'
		},
		{
			area: 'Lips',
			product: 'Matte lipstick',
			colorHex: '#8E1B2C',
			instruction: 'Line, then fill in.'
		}
	]
};

async function setup(
	slots: ('fullBody' | 'portrait' | 'hand')[] = ['fullBody', 'portrait', 'hand']
) {
	const session = await sessionWithPhotos(slots);
	const look = renderedLook(session, 1, 'look_1');
	look.render.image = await makeAsset(session, 'result');
	const shoes = await addWardrobe(session, 'shoes', 'gold heels');
	const earrings = await addWardrobe(session, 'earrings', 'gold hoops');
	const necklace = await addWardrobe(session, 'necklace', 'pearl strand');
	const watch = await addWardrobe(session, 'watch', 'steel watch');
	return { session, look, shoes, earrings, necklace, watch, ...makeEnv(session) };
}
type S = Awaited<ReturnType<typeof setup>>;

const piece = (role: string, w: { id: string }, name = `${role} piece`) => ({
	role,
	name,
	source: { type: 'wardrobe', id: w.id }
});
const fullArgs = (s: S, extra: Record<string, unknown> = {}) => ({
	lookId: s.look.id,
	shoes: piece('shoes', s.shoes),
	accessories: [
		piece('necklace', s.necklace),
		piece('earrings', s.earrings),
		piece('watch', s.watch)
	],
	makeup: MAKEUP,
	hair: {
		templateId: 'all_goddess_waves',
		templateName: 'Goddess Waves',
		rationale: 'Frames the face.'
	},
	...extra
});

beforeEach(() => {
	installYoucamDefaults(yc);
});

describe('finish_look', () => {
	it('rejects invalid makeup effects without calling YouCam', async () => {
		const s = await setup();
		const bad = {
			...MAKEUP,
			effects: [{ category: 'eye_shadow', pattern: { name: 'BAD' }, palettes: [] }]
		};
		const err = await finishLook.run(fullArgs(s, { makeup: bad }), s.env).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ToolError);
		expect(JSON.stringify((err as ToolError).details)).toContain('unknown pattern');
		expect((err as ToolError).message).toContain('Nothing was spent');
		for (const fn of [yc.tryOnShoes, yc.applyMakeup, yc.applyHairstyle, yc.tryOnAccessory]) {
			expect(fn).not.toHaveBeenCalled();
		}
		expect(s.session.lookbook).toBeUndefined();
		expect(s.session.stage).toBe('event');
	});

	it('needs a portrait and a known hair template, spending nothing', async () => {
		const s = await setup(['fullBody']);
		const err = await finishLook.run(fullArgs(s), s.env).catch((e: unknown) => e);
		expect(JSON.stringify((err as ToolError).details)).toContain('portrait');

		const t = await setup(['fullBody', 'portrait']);
		const err2 = await finishLook
			.run(
				fullArgs(t, { hair: { templateId: 'made_up', templateName: 'x', rationale: 'y' } }),
				t.env
			)
			.catch((e: unknown) => e);
		expect((err2 as ToolError).message).toContain('list_hairstyles');
		expect(yc.applyMakeup).not.toHaveBeenCalled();
	});

	it('runs the three panels on valid input and builds the lookbook', async () => {
		const s = await setup();
		const out = (await finishLook.run(fullArgs(s), s.env)) as {
			ok: boolean;
			steps: { label: string; status: string }[];
			unitsRemaining: number;
		};
		const book = s.session.lookbook!;

		expect(s.session.stage).toBe('finishing');
		expect(s.session.chosenLookId).toBe('look_1');
		expect(book.lookId).toBe('look_1');
		expect(out.steps.map((x) => x.status)).toEqual(Array(6).fill('done'));
		expect(out.steps.map((x) => x.label)).toEqual([
			'Shoes: shoes piece',
			'Makeup',
			'Hair: Goddess Waves',
			'Earrings: earrings piece',
			'Necklace: necklace piece',
			'Watch: watch piece'
		]);

		// Full panel: shoes on the look render.
		expect(yc.tryOnShoes).toHaveBeenCalledTimes(1);
		expect((yc.tryOnShoes.mock.calls[0][1] as { person: { id: string } }).person.id).toBe(
			s.look.render.image!.id
		);
		expect(book.full!.id).not.toBe(s.look.render.image!.id);

		// Face panel chain: portrait -> makeup -> hair -> earrings -> necklace.
		const makeupIn = yc.applyMakeup.mock.calls[0][1] as {
			portrait: { id: string };
			effects: unknown[];
		};
		expect(makeupIn.portrait.id).toBe(s.session.photos.portrait!.id);
		expect(makeupIn.effects).toHaveLength(2);
		const hairIn = yc.applyHairstyle.mock.calls[0][1] as {
			portrait: { id: string };
			templateId: string;
		};
		expect(hairIn.portrait.id).toBe(book.makeup!.image.id);
		expect(hairIn.templateId).toBe('all_goddess_waves');
		const acc = yc.tryOnAccessory.mock.calls.map(
			(c) => c[1] as { person: { id: string }; category: string }
		);
		// The panels run side by side, so calls interleave; order within the face panel is what matters.
		expect(acc.map((a) => a.category).filter((c) => c !== 'watch')).toEqual([
			'earrings',
			'necklace'
		]);
		const byCategory = (c: string) => acc.find((a) => a.category === c)!;
		expect(byCategory('earrings').person.id).toBe(book.hair!.image.id);
		expect(byCategory('necklace').person.id).toBe(
			book.accessories.find((a) => a.piece.role === 'earrings')!.image.id
		);
		expect(byCategory('watch').person.id).toBe(s.session.photos.hand!.id);
		expect(book.face!.id).toBe(book.accessories.find((a) => a.piece.role === 'necklace')!.image.id);
		expect(book.hand!.id).toBe(book.accessories.find((a) => a.piece.role === 'watch')!.image.id);
		expect(book.accessories.map((a) => a.panel).sort()).toEqual(['hand', 'portrait', 'portrait']);
		expect(book.makeup!.steps).toHaveLength(2);
		expect(book.hair!.templateName).toBe('Goddess Waves');

		// Pieces were added to the look; units spent: 2 + 1 + 2 + 3.
		expect(s.look.pieces.map((p) => p.role).sort()).toEqual([
			'earrings',
			'necklace',
			'shoes',
			'watch'
		]);
		expect(out.unitsRemaining).toBe(60 - 8);
		expect(blocksOf(s.events, 'lookbook')).toHaveLength(1);
	});

	it('passes the product photo URL to accessories and keeps going from the previous image when a step fails', async () => {
		const s = await setup(['fullBody', 'portrait']);
		const id = newId('prod');
		s.env.agent.products[id] = {
			id,
			role: 'earrings',
			vetted: true,
			product: {
				title: 'Gold studs',
				shop: 'Shop',
				url: 'https://shop.test/studs',
				imageUrl: 'https://cdn.shop.test/studs.jpg',
				image: await makeAsset(s.session, 'product'),
				checkedAt: '2026-10-30T00:00:00.000Z'
			}
		};
		const base = yc.tryOnAccessory.getMockImplementation()!;
		yc.tryOnAccessory.mockImplementationOnce(async () => {
			throw new youcam.YouCamTaskError('error_no_ear', 'No ear was visible.', '2d-vto');
		});
		yc.tryOnAccessory.mockImplementation(base);

		const args = {
			lookId: 'look_1',
			shoes: null,
			accessories: [
				{ role: 'earrings', name: 'Gold studs', source: { type: 'product', id } },
				piece('necklace', s.necklace)
			],
			makeup: MAKEUP,
			hair: null
		};
		const out = (await finishLook.run(args, s.env)) as {
			steps: { label: string; status: string; error?: string }[];
			failed?: string[];
		};

		const calls = yc.tryOnAccessory.mock.calls.map(
			(c) => c[1] as { person: { id: string }; productUrl?: string; category: string }
		);
		expect(calls[0].productUrl).toBe('https://cdn.shop.test/studs.jpg');
		expect(calls[1].productUrl).toBeUndefined();
		// Earrings failed, so the necklace goes on the makeup render.
		expect(calls[1].person.id).toBe(s.session.lookbook!.makeup!.image.id);
		expect(out.steps.map((x) => x.status)).toEqual(['done', 'failed', 'done']);
		expect(out.steps[1].error).toBe('No ear was visible.');
		expect(out.failed).toEqual(['Earrings: Gold studs']);
		expect(yc.tryOnShoes).not.toHaveBeenCalled();
		expect(yc.applyHairstyle).not.toHaveBeenCalled();
		expect(s.session.lookbook!.accessories).toHaveLength(1);
	});

	it('keeps the DIY makeup steps even when the makeup render fails, and skips hand pieces without a hand photo', async () => {
		const s = await setup(['fullBody', 'portrait']);
		yc.applyMakeup.mockRejectedValue(
			new youcam.YouCamTaskError('error_face', 'No face found.', 'makeup')
		);
		const out = (await finishLook.run(fullArgs(s), s.env)) as {
			note?: string;
			steps: { label: string; status: string }[];
		};
		const book = s.session.lookbook!;
		expect(book.makeup!.steps).toHaveLength(2);
		expect(book.makeup!.image.id).toBe(s.session.photos.portrait!.id);
		expect(out.steps.find((x) => x.label === 'Makeup')!.status).toBe('failed');
		expect(out.steps.find((x) => x.label.startsWith('Watch'))!.status).toBe('skipped');
		expect(out.note).toContain('No hand photo');
		// Hair still ran, from the plain portrait.
		expect((yc.applyHairstyle.mock.calls[0][1] as { portrait: { id: string } }).portrait.id).toBe(
			s.session.photos.portrait!.id
		);
	});
});

describe('analyze_face', () => {
	it('analyses once, then returns the saved profile for free', async () => {
		const s = await setup(['portrait']);
		const first = (await analyzeFaceTool.run({}, s.env)) as { cached: boolean };
		const second = (await analyzeFaceTool.run({}, s.env)) as { cached: boolean };
		expect(first.cached).toBe(false);
		expect(second.cached).toBe(true);
		expect(yc.analyzeFace).toHaveBeenCalledTimes(1);
		expect(blocksOf(s.events, 'face_profile')).toHaveLength(1);
		expect(s.session.units.spent).toBe(30);
	});

	it('asks for a portrait first', async () => {
		const s = await setup(['fullBody']);
		const err = await analyzeFaceTool.run({}, s.env).catch((e: unknown) => e);
		expect((err as ToolError).message).toContain('portrait');
		expect(yc.analyzeFace).not.toHaveBeenCalled();
	});
});

describe('list_hairstyles', () => {
	it('filters by gender and returns only id and title', async () => {
		const s = await setup();
		const out = (await listHairstyles.run({ gender: 'male' }, s.env)) as { templates: unknown[] };
		expect(out.templates).toEqual([{ id: 'male_afro', title: 'Afro' }]);
	});
});

export type { Session };
