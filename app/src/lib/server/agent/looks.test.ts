import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);
vi.mock('#lib/server/youcam', async () => (await import('./test-helpers')).youcamMockModule());

import * as youcam from '#lib/server/youcam';
import { ToolError } from './tools/types';
import { decide, proposeLooks, reviseLook } from './tools/looks';
import {
	addWardrobe,
	blocksOf,
	installYoucamDefaults,
	lookInput,
	makeEnv,
	sessionWithPhotos
} from './test-helpers';
import type { Session } from '#lib/types';

const yc = youcam as unknown as ReturnType<typeof import('./test-helpers').youcamMockModule>;

async function setup() {
	const session = await sessionWithPhotos(['fullBody']);
	const dress1 = await addWardrobe(session, 'full_body', 'green gown');
	const dress2 = await addWardrobe(session, 'full_body', 'gold gown');
	const top = await addWardrobe(session, 'upper_body', 'white shirt');
	const skirt = await addWardrobe(session, 'lower_body', 'worn black skirt');
	const coat = await addWardrobe(session, 'outer', 'cape');
	return { session, dress1, dress2, top, skirt, coat, ...makeEnv(session) };
}

const three = (s: Awaited<ReturnType<typeof setup>>) => ({
	looks: [
		lookInput([{ role: 'full_body', type: 'wardrobe', id: s.dress1.id }], 'One'),
		lookInput(
			[
				{ role: 'upper_body', type: 'wardrobe', id: s.top.id },
				{ role: 'lower_body', type: 'wardrobe', id: s.skirt.id }
			],
			'Two'
		),
		lookInput(
			[
				{ role: 'full_body', type: 'wardrobe', id: s.dress2.id },
				{ role: 'outer', type: 'wardrobe', id: s.coat.id }
			],
			'Three'
		)
	]
});

const errorsOf = async (p: Promise<unknown>): Promise<string> => {
	const err = await p.then(
		() => undefined,
		(e: unknown) => e
	);
	expect(err).toBeInstanceOf(ToolError);
	const e = err as ToolError;
	return `${e.message} ${JSON.stringify(e.details ?? {})}`;
};

beforeEach(() => {
	installYoucamDefaults(yc);
});

describe('propose_looks validation', () => {
	it('requires the full-body photo and spends nothing', async () => {
		const s = await setup();
		delete s.session.photos.fullBody;
		const msg = await errorsOf(proposeLooks.run(three(s), s.env));
		expect(msg).toContain('request_photos');
		expect(yc.tryOnGarment).not.toHaveBeenCalled();
	});

	it('needs exactly three looks', async () => {
		const s = await setup();
		const msg = await errorsOf(proposeLooks.run({ looks: three(s).looks.slice(0, 2) }, s.env));
		expect(msg).toContain('exactly three');
	});

	it('rejects bad references, role mismatches and incomplete combinations in one go', async () => {
		const s = await setup();
		const args = three(s);
		args.looks[0] = lookInput([{ role: 'full_body', type: 'wardrobe', id: 'wd_nope' }], 'Ghost');
		args.looks[1] = lookInput([{ role: 'upper_body', type: 'wardrobe', id: s.top.id }], 'Half');
		args.looks[2] = lookInput(
			[
				{ role: 'upper_body', type: 'wardrobe', id: s.dress1.id },
				{ role: 'lower_body', type: 'product', id: 'prod_missing' }
			],
			'Mismatch'
		);
		const msg = await errorsOf(proposeLooks.run(args, s.env));
		expect(msg).toContain('wardrobe item \\"wd_nope\\" does not exist');
		expect(msg).toContain('needs a lower_body piece');
		expect(msg).toContain('is a full_body, not a upper_body');
		expect(msg).toContain('product \\"prod_missing\\" does not exist');
		expect(s.session.looks).toHaveLength(0);
		expect(yc.tryOnGarment).not.toHaveBeenCalled();
	});

	it('rejects full_body mixed with upper_body', async () => {
		const s = await setup();
		const args = three(s);
		args.looks[0] = lookInput(
			[
				{ role: 'full_body', type: 'wardrobe', id: s.dress1.id },
				{ role: 'upper_body', type: 'wardrobe', id: s.top.id }
			],
			'Mixed'
		);
		expect(await errorsOf(proposeLooks.run(args, s.env))).toContain('cannot be combined');
	});
});

describe('propose_looks rendering', () => {
	it('renders all three looks in parallel, chaining garments, and survives one look failing', async () => {
		const s = await setup();
		let inflight = 0;
		let maxInflight = 0;
		const failing = s.skirt.image.id;
		const base = yc.tryOnGarment.getMockImplementation()!;
		yc.tryOnGarment.mockImplementation(
			async (ctx: { session: Session }, input: { garment: { id: string } }) => {
				inflight++;
				maxInflight = Math.max(maxInflight, inflight);
				await new Promise((r) => setTimeout(r, 15));
				inflight--;
				if (input.garment.id === failing) {
					throw new youcam.YouCamTaskError(
						'error_bottom_garment',
						'That skirt photo could not be used.',
						'cloth'
					);
				}
				return base(ctx, input);
			}
		);

		const out = (await proposeLooks.run(three(s), s.env)) as {
			ok: boolean;
			looks: { status: string; error?: string }[];
			unitsRemaining: number;
			note?: string;
		};

		expect(maxInflight).toBe(3);
		expect(s.session.stage).toBe('looks');
		expect(s.session.looks.map((l) => [l.index, l.render.status])).toEqual([
			[1, 'done'],
			[2, 'failed'],
			[3, 'done']
		]);
		expect(blocksOf(s.events, 'looks')).toHaveLength(1);

		// Look 2: top rendered, bottom failed with the user-safe message.
		const two = s.session.looks[1];
		expect(two.render.steps.map((x) => x.status)).toEqual(['done', 'failed']);
		expect(two.render.error).toBe('That skirt photo could not be used.');
		expect(two.render.image).toBeUndefined();

		// Look 3: outerwear went on the dress render, not on the original photo.
		const three3 = s.session.looks[2];
		const calls = yc.tryOnGarment.mock.calls.map(
			(c) =>
				c[1] as {
					person: { id: string };
					category: string;
					garment: { id: string };
					changeShoes?: boolean;
				}
		);
		const outerCall = calls.find((c) => c.category === 'outer')!;
		expect(outerCall.person.id).toBe(three3.render.steps[0].image!.id);
		expect(outerCall.changeShoes).toBe(false);
		expect(three3.render.image!.id).toBe(three3.render.steps[1].image!.id);
		// The bottom is dressed on the top's result.
		const lowerCall = calls.find((c) => c.category === 'lower_body')!;
		expect(lowerCall.person.id).toBe(two.render.steps[0].image!.id);

		expect(out.ok).toBe(true);
		expect(out.looks.map((l) => l.status)).toEqual(['done', 'failed', 'done']);
		expect(out.note).toContain('1 look(s) failed');
		expect(out.unitsRemaining).toBe(60 - 2 * 4);
		// Shoes and accessories are not part of this step.
		expect(yc.tryOnShoes).not.toHaveBeenCalled();
		expect(yc.tryOnAccessory).not.toHaveBeenCalled();
		// Progress frames per look.
		expect(
			s.events.filter((e) => e.type === 'activity' && e.label.startsWith('Trying look 1'))
		).not.toHaveLength(0);
	});

	it('marks a look failed when the unit cap is hit', async () => {
		const s = await setup();
		yc.tryOnGarment.mockRejectedValue(new youcam.UnitCapError(2, 0));
		const out = (await proposeLooks.run(three(s), s.env)) as {
			ok: boolean;
			looks: { error?: string }[];
		};
		expect(out.ok).toBe(false);
		expect(out.looks[0].error).toContain('needs 2');
	});
});

describe('revise_look', () => {
	it('replaces one look, bumps its version, and re-renders only that look', async () => {
		const s = await setup();
		await proposeLooks.run(three(s), s.env);
		s.session.decision = { lookId: s.session.looks[1].id, reason: 'r', ranking: [] };
		s.session.chosenLookId = s.session.looks[1].id;
		const before = yc.tryOnGarment.mock.calls.length;
		const keepId = s.session.looks[1].id;

		await reviseLook.run(
			{
				lookIndex: 2,
				look: lookInput([{ role: 'full_body', type: 'wardrobe', id: s.dress2.id }], 'Two, revised')
			},
			s.env
		);

		expect(yc.tryOnGarment.mock.calls.length - before).toBe(1);
		const revised = s.session.looks[1];
		expect(revised.id).toBe(keepId);
		expect(revised.version).toBe(2);
		expect(revised.title).toBe('Two, revised');
		expect(revised.render.status).toBe('done');
		expect(s.session.looks[0].version).toBe(1);
		expect(s.session.decision).toBeUndefined();
		expect(s.session.chosenLookId).toBeUndefined();
	});

	it('rejects an unknown look index', async () => {
		const s = await setup();
		const msg = await errorsOf(
			reviseLook.run(
				{
					lookIndex: 2,
					look: lookInput([{ role: 'full_body', type: 'wardrobe', id: s.dress1.id }])
				},
				s.env
			)
		);
		expect(msg).toContain('there is no look 2');
	});
});

describe('decide', () => {
	it('records the decision, chosen look and stage', async () => {
		const s = await setup();
		await proposeLooks.run(three(s), s.env);
		const [a, b, c] = s.session.looks;
		await decide.run(
			{
				chosenLookId: b.id,
				reason: 'Best for black tie.',
				ranking: [
					{ lookId: a.id, score: 70, note: 'good' },
					{ lookId: b.id, score: 91, note: 'best' },
					{ lookId: c.id, score: 60, note: 'ok' }
				]
			},
			s.env
		);
		expect(s.session.chosenLookId).toBe(b.id);
		expect(s.session.stage).toBe('chosen');
		expect(s.session.decision?.ranking.map((r) => r.score)).toEqual([91, 70, 60]);
		expect(blocksOf(s.events, 'decision')).toHaveLength(1);
	});

	it('validates ids and scores, and refuses a failed look', async () => {
		const s = await setup();
		await proposeLooks.run(three(s), s.env);
		const msg = await errorsOf(
			decide.run(
				{ chosenLookId: 'x', reason: 'r', ranking: [{ lookId: 'y', score: 140, note: 'n' }] },
				s.env
			)
		);
		expect(msg).toContain('does not exist');
		expect(msg).toContain('at most 100');

		s.session.looks[0].render.status = 'failed';
		const msg2 = await errorsOf(
			decide.run(
				{
					chosenLookId: s.session.looks[0].id,
					reason: 'r',
					ranking: [{ lookId: s.session.looks[0].id, score: 50, note: 'n' }]
				},
				s.env
			)
		);
		expect(msg2).toContain('failed to render');
	});
});
