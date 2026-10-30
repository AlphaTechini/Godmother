// Generates Godmother's original SVG demo illustrations (fashion-illustration style,
// deliberately not photographic). Output: app/static/demo/*.svg (served at /demo/*.svg).
// Run: node demo/assets/draw.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../../static/demo');
mkdirSync(out, { recursive: true });

/* ---------------------------------------------------------------- helpers */
const r = (n) => Math.round(n * 10) / 10;
/** Catmull-Rom spline through points, as a cubic Bezier path. */
function smooth(pts, closed = true, t = 1) {
	const n = pts.length;
	const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
	let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
	const last = closed ? n : n - 1;
	for (let i = 0; i < last; i++) {
		const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
		const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t, p1[1] + ((p2[1] - p0[1]) / 6) * t];
		const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t, p2[1] - ((p3[1] - p1[1]) / 6) * t];
		d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
	}
	return d + (closed ? 'Z' : '');
}
const mirror = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]);
/** Left contour (top to bottom) mirrored into a closed symmetric outline. */
const sym = (left, cx = 300) => [...left, ...mirror(left, cx).reverse()];
const svg = (w, h, body, title) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${title}</title>${body}</svg>`;
const save = (name, content) => {
	writeFileSync(join(out, name), content.replace(/\s+/g, ' ').replace(/> </g, '><'));
	console.log(name, (content.length / 1024).toFixed(1) + ' KB');
};

const SKIN = { base: '#6E4532', shade: '#55331F', light: '#8A5A40', line: '#3A2216' };
const INK = '#2A1F18';
const GOLD = ['#F3DDA4', '#C9A25A', '#8E6A2E'];

/** Paper-like studio backdrop with a soft spotlight and floor shadow. */
function backdrop(w, h, a, b, id) {
	return `<defs><radialGradient id="${id}-bd" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
	<linearGradient id="${id}-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient></defs>
	<rect width="${w}" height="${h}" fill="url(#${id}-bd)"/><rect y="${h * 0.78}" width="${w}" height="${h * 0.22}" fill="url(#${id}-fl)"/>`;
}
const goldGrad = (id, x2 = 1, y2 = 1) =>
	`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${GOLD[0]}"/><stop offset=".55" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[2]}"/></linearGradient>`;

/* ------------------------------------------------------- full-body figure */
// 600 x 900 canvas, centre line x = 300.
const head = smooth([[300, 112], [322, 120], [329, 146], [323, 172], [300, 186], [277, 172], [271, 146], [278, 120]]);
const neckShoulders = smooth(
	sym([[291, 176], [289, 204], [276, 220], [250, 228], [236, 240], [240, 262], [262, 300], [286, 320]]),
	true
);
const armL = smooth([[240, 236], [229, 270], [222, 320], [216, 372], [214, 420], [217, 452], [214, 470], [216, 492], [226, 503], [236, 494], [237, 470], [233, 452], [236, 418], [242, 370], [250, 320], [256, 280], [258, 252]]);
const armR = smooth(mirror([[240, 236], [229, 270], [222, 320], [216, 372], [214, 420], [217, 452], [214, 470], [216, 492], [226, 503], [236, 494], [237, 470], [233, 452], [236, 418], [242, 370], [250, 320], [256, 280], [258, 252]], 300));

function figure({ id, gown, hair = 'updo', extras = '', shoes = GOLD[1], backdropA, backdropB, title }) {
	const hairShape =
		hair === 'updo'
			? `<path d="${smooth([[270, 150], [270, 124], [284, 107], [300, 102], [316, 107], [330, 124], [330, 150], [324, 132], [312, 120], [300, 118], [288, 120], [276, 132]])}" fill="#1B120D"/><ellipse cx="300" cy="96" rx="17" ry="14" fill="#1B120D"/><path d="M286 98q14-8 28 0" stroke="#3A2A20" stroke-width="1.2" fill="none"/>`
			: hair === 'gele'
				? `<path d="${smooth([[268, 146], [262, 116], [244, 92], [238, 64], [262, 54], [284, 40], [300, 34], [318, 40], [344, 52], [366, 66], [360, 96], [340, 118], [332, 146], [318, 126], [300, 120], [282, 126]])}" fill="url(#${id}-gele)"/>
				<g stroke="#0B3B2C" stroke-width="1.4" fill="none" opacity=".55"><path d="M262 66q20 30 30 56"/><path d="M284 44q10 36 14 74"/><path d="M318 42q-6 36-10 76"/><path d="M346 56q-18 30-26 62"/><path d="M248 88q22 18 32 40"/></g>`
				: '';
	return svg(
		600,
		900,
		`${backdrop(600, 900, backdropA, backdropB, id)}
	<defs>${goldGrad(`${id}-gold`)}
	<linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${SKIN.shade}"/><stop offset=".45" stop-color="${SKIN.light}"/><stop offset="1" stop-color="${SKIN.shade}"/></linearGradient>
	<linearGradient id="${id}-gele" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1F7A5A"/><stop offset=".5" stop-color="#12543E"/><stop offset="1" stop-color="#0B3B2C"/></linearGradient>
	${gown.defs}</defs>
	<ellipse cx="300" cy="866" rx="120" ry="12" fill="#000" opacity=".13"/>
	<g stroke="${SKIN.line}" stroke-width="1" stroke-opacity=".35">
	<path d="${armL}" fill="url(#${id}-skin)"/><path d="${armR}" fill="url(#${id}-skin)"/>
	<path d="${neckShoulders}" fill="url(#${id}-skin)"/>
	<path d="${head}" fill="url(#${id}-skin)"/></g>
	<path d="M292 186q8 6 16 0" stroke="${SKIN.shade}" stroke-width="2" fill="none" opacity=".6"/>
	<path d="M294 166q6 3 12 0" stroke="#5A1E24" stroke-width="2.6" stroke-linecap="round" fill="none"/>
	${hairShape}
	<g fill="${shoes}"><path d="M268 852q12-8 26 0l2 10h-30z"/><path d="M306 852q12-8 26 0l2 10h-30z"/></g>
	${gown.body}
	${extras}`,
		title
	);
}

// Look 1: emerald satin column, sweetheart neckline, gold belt and cuff.
const columnPts = sym([[300, 270], [286, 258], [266, 258], [258, 280], [262, 330], [270, 366], [264, 410], [258, 470], [256, 560], [254, 660], [250, 760], [244, 852], [272, 857]]);
const emerald = {
	defs: `<linearGradient id="l1-satin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06291E"/><stop offset=".22" stop-color="#11553F"/><stop offset=".38" stop-color="#2E8C69"/><stop offset=".5" stop-color="#145E46"/><stop offset=".7" stop-color="#0E4835"/><stop offset=".84" stop-color="#2A7A5D"/><stop offset="1" stop-color="#06291E"/></linearGradient>`,
	body: `<path d="${smooth(columnPts)}" fill="url(#l1-satin)" stroke="#04211A" stroke-width="1"/>
	<g stroke="#9FE0C3" stroke-width="1.2" fill="none" opacity=".22"><path d="M286 380q-6 220-14 470"/><path d="M314 380q4 240 10 470"/><path d="M300 400q2 220 0 450"/></g>
	<path d="M268 364q32 8 64 0" stroke="url(#l1-gold)" stroke-width="5" fill="none" stroke-linecap="round"/>
	<rect x="213" y="446" width="22" height="9" rx="3" fill="url(#l1-gold)"/>
	<circle cx="272" cy="166" r="3.2" fill="url(#l1-gold)"/><circle cx="328" cy="166" r="3.2" fill="url(#l1-gold)"/>`
};
save('look-1.svg', figure({ id: 'l1', gown: emerald, backdropA: '#EFE8DC', backdropB: '#D8CCB9', title: 'Illustration: emerald satin column gown with gold belt' }));

// Look 2: gold sequin mermaid with V-neck and cap sleeves, emerald gele.
const mermaidPts = sym([[300, 300], [284, 262], [262, 238], [244, 238], [242, 262], [258, 290], [264, 330], [270, 366], [262, 420], [258, 520], [262, 620], [252, 700], [224, 800], [200, 856], [260, 860]]);
const goldGown = {
	defs: `<pattern id="l2-seq" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.6" fill="#F6E2AE" opacity=".55"/><circle cx="0" cy="0" r="2.6" fill="#7E5B23" opacity=".35"/><circle cx="10" cy="10" r="2.6" fill="#7E5B23" opacity=".35"/></pattern>
	<linearGradient id="l2-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A5A24"/><stop offset=".35" stop-color="#D6B067"/><stop offset=".55" stop-color="#F0D594"/><stop offset=".8" stop-color="#B48A43"/><stop offset="1" stop-color="#6D4F1E"/></linearGradient>`,
	body: `<path id="l2-shape" d="${smooth(mermaidPts)}" fill="url(#l2-g)" stroke="#5E4419" stroke-width="1"/>
	<path d="${smooth(mermaidPts)}" fill="url(#l2-seq)"/>
	<g stroke="#5E4419" stroke-width="1" fill="none" opacity=".35"><path d="M262 660q38 14 76 0"/><path d="M276 700q-20 80-56 150"/><path d="M324 700q20 80 56 150"/></g>
	<path d="M269 365q31 6 62 0" stroke="#12543E" stroke-width="3" fill="none"/>`
};
save('look-2.svg', figure({ id: 'l2', gown: goldGown, hair: 'gele', backdropA: '#E7E3DA', backdropB: '#CFC6B8', title: 'Illustration: gold sequin mermaid gown with emerald gele' }));

// Look 3: black velvet off-shoulder A-line with emerald satin stole.
const velvetPts = sym([[300, 246], [270, 244], [240, 240], [228, 252], [232, 282], [252, 288], [262, 330], [270, 366], [262, 420], [250, 520], [236, 640], [218, 760], [204, 856], [262, 862]]);
const velvet = {
	defs: `<radialGradient id="l3-v" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#3A3436"/><stop offset=".5" stop-color="#1A1718"/><stop offset="1" stop-color="#070606"/></radialGradient>
	<linearGradient id="l3-stole" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0B3B2C"/><stop offset=".5" stop-color="#2E8C69"/><stop offset="1" stop-color="#0B3B2C"/></linearGradient>`,
	body: `<path d="${smooth(velvetPts)}" fill="url(#l3-v)" stroke="#000" stroke-width="1"/>
	<g stroke="#5D5457" stroke-width="1.1" fill="none" opacity=".45"><path d="M282 420q-14 200-40 436"/><path d="M318 420q14 200 40 436"/><path d="M300 430v424"/></g>
	<path d="${smooth([[212, 420], [240, 452], [300, 470], [360, 452], [388, 420], [392, 446], [362, 486], [300, 500], [238, 486], [208, 446]])}" fill="url(#l3-stole)" opacity=".95"/>
	<path d="M210 446q-8 120 4 240" stroke="#145E46" stroke-width="16" stroke-linecap="round" fill="none"/>
	<path d="M390 446q8 120-4 240" stroke="#145E46" stroke-width="16" stroke-linecap="round" fill="none"/>
	<circle cx="272" cy="168" r="4" fill="#2E8C69" stroke="url(#l3-gold)" stroke-width="1.4"/><circle cx="328" cy="168" r="4" fill="#2E8C69" stroke="url(#l3-gold)" stroke-width="1.4"/>`
};
save('look-3.svg', figure({ id: 'l3', gown: velvet, backdropA: '#EDE4D8', backdropB: '#D5C5B1', title: 'Illustration: black velvet off-shoulder gown with emerald stole' }));

// Final full look: look 1 with shoes and a gold clutch in hand.
save(
	'final-full.svg',
	figure({
		id: 'ff',
		gown: emerald,
		backdropA: '#F1EADF',
		backdropB: '#D6C8B3',
		title: 'Illustration: the finished look, emerald column with gold sandals'
	}).replace(/l1-satin/g, 'ff-satin').replace(/l1-gold/g, 'ff-gold')
);

// Original upload: the same figure in plain black tee and trousers.
const casual = {
	defs: ``,
	body: `<path d="${smooth(sym([[300, 210], [286, 212], [262, 224], [240, 236], [232, 262], [244, 300], [258, 300], [262, 340], [264, 390], [268, 400]]))}" fill="#26221F" stroke="#111" stroke-width="1"/>
	<path d="${smooth(sym([[300, 392], [268, 392], [262, 440], [262, 560], [266, 700], [268, 846], [294, 848], [298, 560]]), true)}" fill="#3C3A40" stroke="#1A191C" stroke-width="1"/>
	<path d="M300 420v420" stroke="#1A191C" stroke-width="1.4"/>`
};
save('upload-full.svg', figure({ id: 'uf', gown: casual, hair: 'updo', shoes: '#EDEAE4', backdropA: '#E9E7E2', backdropB: '#CFCBC3', title: 'Illustration: full-body photo, front facing, plain clothes' }));

/* -------------------------------------------------------------- portrait */
// 640 x 800, centre line x = 320.
function portrait({ id, made, title }) {
	const face = smooth([[320, 196], [384, 214], [420, 286], [424, 352], [410, 424], [376, 488], [320, 516], [264, 488], [230, 424], [216, 352], [220, 286], [256, 214]]);
	const neck = smooth(sym([[282, 470], [278, 560], [250, 610], [150, 640], [70, 680], [30, 760], [20, 800], [320, 800]], 320));
	const lip = made ? '#8C2A36' : '#76473B';
	const hair = made
		? `<path d="${smooth([[214, 330], [214, 262], [246, 200], [320, 176], [394, 200], [426, 262], [426, 330], [404, 268], [370, 236], [320, 228], [270, 236], [236, 268]])}" fill="#140D09"/>
		<ellipse cx="320" cy="168" rx="78" ry="58" fill="#140D09"/>
		<g stroke="#3B2A20" stroke-width="2" fill="none" opacity=".8"><path d="M262 214q58-30 116 0"/><path d="M254 150q66-34 132 0"/><path d="M270 120q50-20 100 0"/><path d="M320 232q-30-20-70 20"/></g>`
		: `<ellipse cx="320" cy="250" rx="196" ry="168" fill="#1A110C"/><path d="M226 300q10-80 94-94q84 14 94 94q-30-46-94-52q-64 6-94 52z" fill="#1A110C"/>`;
	const eye = (cx, flip) => {
		const s = flip ? -1 : 1;
		// Made-up face: lowered lids show the shadow; bare face: open almond eyes.
		const open = made
			? `<path d="M-34 2q34-12 70 0q-34 12-70 0z" fill="#F2E7DA"/><path d="M-34 2q34-12 70 0q-34 6-70 0z" fill="#2A160C"/>
			<path d="M-46 -2q46-40 92 -2q-46-10-92 2z" fill="url(#${id}-shadow)"/><path d="M-36 2q36-16 74 -2" fill="${SKIN.base}" stroke="#120A06" stroke-width="4" stroke-linecap="round"/>
			<path d="M38 0l13 -7" stroke="#120A06" stroke-width="3.2" stroke-linecap="round"/>
			<g stroke="#120A06" stroke-width="1.6" stroke-linecap="round"><path d="M-18 7l-2 4M-6 8l-1 4M6 8l1 4M18 7l2 4"/></g>`
			: `<path d="M-32 0q32-18 66 0q-32 14-66 0z" fill="#F2E7DA"/><circle cx="2" cy="-1" r="9.5" fill="#2A160C"/><circle cx="5" cy="-4" r="2.4" fill="#fff" opacity=".8"/>
			<path d="M-34 0q34-22 70 -2" stroke="#120A06" stroke-width="2" fill="none" stroke-linecap="round"/>`;
		return `<g transform="translate(${cx} 356) scale(${s} 1)">${open}
		<path d="M-38 -36q26-16 70 -6" stroke="#1A0F09" stroke-width="${made ? 6 : 4.5}" fill="none" stroke-linecap="round"/></g>`;
	};
	return svg(
		640,
		800,
		`${backdrop(640, 800, made ? '#EFE6D8' : '#E8E6E1', made ? '#CDBBA3' : '#CBC7BF', id)}
	<defs>${goldGrad(`${id}-gold`)}
	<radialGradient id="${id}-skin" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="${SKIN.light}"/><stop offset=".7" stop-color="${SKIN.base}"/><stop offset="1" stop-color="${SKIN.shade}"/></radialGradient>
	<linearGradient id="${id}-shadow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#B98A4E"/><stop offset="1" stop-color="#5B3A22" stop-opacity=".2"/></linearGradient>
	<radialGradient id="${id}-blush"><stop offset="0" stop-color="#B0475A" stop-opacity=".45"/><stop offset="1" stop-color="#B0475A" stop-opacity="0"/></radialGradient>
	<radialGradient id="${id}-hl"><stop offset="0" stop-color="#F6D9A8" stop-opacity=".5"/><stop offset="1" stop-color="#F6D9A8" stop-opacity="0"/></radialGradient>
	<linearGradient id="${id}-satin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06291E"/><stop offset=".3" stop-color="#2E8C69"/><stop offset=".55" stop-color="#11553F"/><stop offset=".8" stop-color="#2A7A5D"/><stop offset="1" stop-color="#06291E"/></linearGradient></defs>
	${made ? '' : hair}
	<g stroke="${SKIN.line}" stroke-opacity=".3"><path d="${neck}" fill="url(#${id}-skin)"/>
	<ellipse cx="214" cy="362" rx="14" ry="30" fill="${SKIN.base}"/><ellipse cx="426" cy="362" rx="14" ry="30" fill="${SKIN.base}"/>
	<path d="${face}" fill="url(#${id}-skin)"/></g>
	${made ? hair : ''}
	${made ? `<ellipse cx="262" cy="420" rx="44" ry="26" fill="url(#${id}-blush)"/><ellipse cx="378" cy="420" rx="44" ry="26" fill="url(#${id}-blush)"/><ellipse cx="258" cy="392" rx="30" ry="12" fill="url(#${id}-hl)"/><ellipse cx="382" cy="392" rx="30" ry="12" fill="url(#${id}-hl)"/><path d="M321 392v22" stroke="#F6D9A8" stroke-width="4" opacity=".16" stroke-linecap="round"/>` : ''}
	${eye(274, false)}${eye(366, true)}
	<path d="M326 388q-2 14-12 24q10 7 22 1" stroke="${SKIN.shade}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
	<path d="M282 452q20-12 38-4q18-8 38 4q-18 10-38 8q-20 2-38-8z" fill="${lip}"/>
	<path d="M282 452q38 40 76 0q-18 10-38 8q-20 2-38-8z" fill="${lip}" opacity=".92"/>
	<path d="M300 466q20 8 40 0" stroke="#fff" stroke-width="2" opacity="${made ? 0.25 : 0.1}" fill="none"/>
	${made ? `<path d="M110 660q210 70 420 0" stroke="url(#${id}-gold)" stroke-width="4" fill="none"/><path d="M320 692l-12 18l12 22l12-22z" fill="#2E8C69" stroke="url(#${id}-gold)" stroke-width="2"/>
	<g><circle cx="214" cy="398" r="5" fill="url(#${id}-gold)"/><path d="M214 404l-12 26l12 22l12-22z" fill="#2E8C69" stroke="url(#${id}-gold)" stroke-width="2"/></g>
	<g><circle cx="426" cy="398" r="5" fill="url(#${id}-gold)"/><path d="M426 404l-12 26l12 22l12-22z" fill="#2E8C69" stroke="url(#${id}-gold)" stroke-width="2"/></g>
	<path d="${smooth([[0, 760], [140, 740], [240, 752], [320, 770], [400, 752], [500, 740], [640, 760], [640, 800], [0, 800]])}" fill="url(#${id}-satin)"/>`
	: `<path d="${smooth([[0, 800], [24, 730], [80, 684], [190, 650], [262, 636], [320, 668], [378, 636], [450, 650], [560, 684], [616, 730], [640, 800]], false)}Z" fill="#26221F"/><path d="M262 636q58 52 116 0" stroke="#3A3633" stroke-width="9" fill="none"/>`}`,
		title
	);
}
save('upload-portrait.svg', portrait({ id: 'up', made: false, title: 'Illustration: portrait photo, bare face, natural hair' }));
save('final-face.svg', portrait({ id: 'fp', made: true, title: 'Illustration: finished face, bronze eyes, berry lip, sculpted updo, emerald drop earrings' }));

/* ------------------------------------------------------------------ hand */
function hand({ id, made, title }) {
	const fingers = [
		{ x: 318, y: 352, w: 52, h: 200, a: -8 },
		{ x: 378, y: 322, w: 56, h: 226, a: -2 },
		{ x: 438, y: 336, w: 52, h: 212, a: 4 },
		{ x: 494, y: 384, w: 44, h: 164, a: 11 }
	];
	const nail = made ? '#8C2A36' : '#C99A86';
	const f = fingers
		.map(
			({ x, y, w, h, a }) => `<g transform="rotate(${a} ${x + w / 2} ${y + h})"><rect x="${x}" y="${y}" width="${w}" height="${h + 30}" rx="${w / 2}" fill="url(#${id}-skin)" stroke="${SKIN.line}" stroke-opacity=".3"/>
	<rect x="${x + 9}" y="${y + 8}" width="${w - 18}" height="${w * 0.75}" rx="${(w - 18) / 2}" fill="${nail}"/>
	<path d="M${x + 12} ${y + h * 0.42}q${w / 2 - 12} 6 ${w - 24} 0M${x + 14} ${y + h * 0.72}q${w / 2 - 14} 6 ${w - 28} 0" stroke="${SKIN.shade}" stroke-width="2" fill="none" opacity=".7"/></g>`
		)
		.join('');
	const palm = smooth([[302, 566], [316, 522], [430, 506], [540, 524], [560, 590], [546, 660], [520, 720], [526, 800], [332, 800], [330, 722], [300, 650]]);
	const thumb = `<g transform="rotate(-42 318 640)"><rect x="290" y="488" width="58" height="170" rx="29" fill="url(#${id}-skin)" stroke="${SKIN.line}" stroke-opacity=".3"/><rect x="300" y="496" width="38" height="40" rx="19" fill="${nail}"/></g>`;
	const watch = made
		? `<rect x="316" y="652" width="214" height="62" rx="8" fill="url(#${id}-mesh)" stroke="#7A5A24"/>
		<circle cx="424" cy="683" r="62" fill="url(#${id}-gold)"/><circle cx="424" cy="683" r="50" fill="#F5EFE3"/>
		<g stroke="#2A1F18" stroke-width="2.4" stroke-linecap="round"><path d="M424 641v8M424 717v8M382 683h8M458 683h8"/><path d="M424 683l-16-22M424 683l26 6"/></g><circle cx="424" cy="683" r="3" fill="#2A1F18"/>
		<g transform="rotate(6 471 548)"><rect x="452" y="520" width="46" height="16" rx="5" fill="url(#${id}-gold)"/><path d="M475 504l-12 16h24z" fill="#2E8C69" stroke="url(#${id}-gold)" stroke-width="2"/></g>`
		: '';
	return svg(
		800,
		800,
		`${backdrop(800, 800, made ? '#EFE6D8' : '#E9E7E2', made ? '#D2C2AC' : '#CDC9C1', id)}
	<defs>${goldGrad(`${id}-gold`)}<linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${SKIN.shade}"/><stop offset=".5" stop-color="${SKIN.light}"/><stop offset="1" stop-color="${SKIN.base}"/></linearGradient>
	<pattern id="${id}-mesh" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#C9A25A"/><path d="M0 6L6 0" stroke="#F3DDA4" stroke-width="1.2"/></pattern></defs>
	${thumb}${f}
	<path d="${palm}" fill="url(#${id}-skin)" stroke="${SKIN.line}" stroke-opacity=".3"/>
	<g stroke="${SKIN.shade}" stroke-width="2" fill="none" opacity=".5"><path d="M352 560q8 40 4 80"/><path d="M412 552q4 50 0 96"/><path d="M470 556q-2 50-8 96"/></g>
	${watch}`,
		title
	);
}
save('upload-hand.svg', hand({ id: 'uh', made: false, title: 'Illustration: back of the hand, five fingers visible' }));
save('final-hand.svg', hand({ id: 'fh', made: true, title: 'Illustration: hand wearing a gold mesh watch and an emerald ring' }));

/* -------------------------------------------------------------- products */
const productBg = (id) => `<defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F4EE"/><stop offset="1" stop-color="#ECE7DE"/></linearGradient>${goldGrad(`${id}-gold`)}</defs><rect width="600" height="600" fill="url(#${id}-bg)"/><ellipse cx="300" cy="560" rx="170" ry="10" fill="#000" opacity=".06"/>`;

function gownProduct(id, fill, defs, title) {
	const pts = sym([[300, 132], [284, 124], [262, 126], [258, 150], [262, 196], [268, 222], [262, 260], [258, 340], [254, 440], [244, 540], [270, 546]]);
	return svg(600, 600, `${productBg(id)}<defs>${defs}</defs>
	<path d="M300 70a14 14 0 1 1 10 14v14M220 126l80-28l80 28z" stroke="#8C8478" stroke-width="3" fill="none" stroke-linejoin="round"/>
	<path d="${smooth(pts)}" fill="${fill}" stroke="#00000033"/>`, title);
}
save('product-gown-emerald.svg', gownProduct('pg1', 'url(#pg1-s)', `<linearGradient id="pg1-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06291E"/><stop offset=".35" stop-color="#2E8C69"/><stop offset=".55" stop-color="#11553F"/><stop offset=".82" stop-color="#2A7A5D"/><stop offset="1" stop-color="#06291E"/></linearGradient>`, 'Product: emerald satin column gown on a hanger'));
save('product-gown-gold.svg', gownProduct('pg2', 'url(#pg2-s)', `<linearGradient id="pg2-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A5A24"/><stop offset=".4" stop-color="#E4C47E"/><stop offset=".6" stop-color="#F0D594"/><stop offset="1" stop-color="#6D4F1E"/></linearGradient>`, 'Product: gold sequin gown on a hanger'));
save('product-gown-velvet.svg', gownProduct('pg3', 'url(#pg3-s)', `<radialGradient id="pg3-s" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#3A3436"/><stop offset="1" stop-color="#070606"/></radialGradient>`, 'Product: black velvet gown on a hanger'));

save('product-sandals.svg', svg(600, 600, `${productBg('ps')}
	<path d="M120 420q40-10 110-6q90 8 170-60q30-26 60-30q30 0 40 30q8 30-10 70l-8 70h-22l-6-50q-40 10-110 20q-120 18-190 10q-40-4-34-54z" fill="url(#ps-gold)" stroke="#7A5A24" stroke-width="2"/>
	<path d="M470 420l-6 120h18l12-120z" fill="#8E6A2E"/><path d="M180 410q60-60 140-40M250 404q40-40 100-46M360 360q20-40 70-50" stroke="#8E6A2E" stroke-width="10" fill="none" stroke-linecap="round"/>
	<path d="M120 448q140 20 330-30" stroke="#5E4419" stroke-width="6" fill="none"/>`, 'Product: gold strappy sandal, side view'));

save('product-earrings.svg', svg(600, 600, `${productBg('pe')}
	${[220, 380].map((x) => `<circle cx="${x}" cy="180" r="14" fill="url(#pe-gold)"/><path d="M${x} 194v40" stroke="url(#pe-gold)" stroke-width="4"/><path d="M${x} 234l-44 90l44 110l44-110z" fill="#1F7A5A" stroke="url(#pe-gold)" stroke-width="6" stroke-linejoin="round"/><path d="M${x} 250l-24 74l24 76" stroke="#9FE0C3" stroke-width="3" fill="none" opacity=".6"/>`).join('')}`, 'Product: emerald and gold drop earrings'));

save('product-necklace.svg', svg(600, 600, `${productBg('pn')}
	<path d="M110 150q190 300 380 0" stroke="url(#pn-gold)" stroke-width="7" fill="none"/>
	<path d="M300 374l-30 46l30 56l30-56z" fill="#1F7A5A" stroke="url(#pn-gold)" stroke-width="5"/>`, 'Product: gold chain necklace with emerald pendant'));

save('product-watch.svg', svg(600, 600, `${productBg('pw')}<defs><pattern id="pw-mesh" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#C9A25A"/><path d="M0 8L8 0" stroke="#F3DDA4" stroke-width="1.4"/></pattern></defs>
	<rect x="250" y="40" width="100" height="520" rx="14" fill="url(#pw-mesh)" stroke="#7A5A24"/>
	<circle cx="300" cy="300" r="112" fill="url(#pw-gold)"/><circle cx="300" cy="300" r="92" fill="#F5EFE3"/>
	<g stroke="#2A1F18" stroke-width="4" stroke-linecap="round"><path d="M300 222v14M300 364v14M222 300h14M364 300h14M300 300l-28-38M300 300l46 10"/></g><circle cx="300" cy="300" r="6" fill="#2A1F18"/>
	<rect x="410" y="290" width="16" height="22" rx="4" fill="url(#pw-gold)"/>`, 'Product: gold mesh bracelet watch'));

save('product-clutch.svg', svg(600, 600, `${productBg('pc')}
	<rect x="140" y="220" width="320" height="200" rx="26" fill="url(#pc-gold)" stroke="#7A5A24" stroke-width="2"/>
	<path d="M140 290h320" stroke="#7A5A24" stroke-width="2" opacity=".7"/><circle cx="300" cy="290" r="16" fill="#1F7A5A" stroke="url(#pc-gold)" stroke-width="4"/>
	<g stroke="#F6E2AE" stroke-width="2" opacity=".5"><path d="M170 330h260M170 360h260M170 390h260"/></g>`, 'Product: gold box clutch with emerald clasp'));

save('product-ring.svg', svg(600, 600, `${productBg('pr')}
	<ellipse cx="300" cy="350" rx="110" ry="110" fill="none" stroke="url(#pr-gold)" stroke-width="22"/>
	<path d="M300 170l-46 60l46 70l46-70z" fill="#1F7A5A" stroke="url(#pr-gold)" stroke-width="8" stroke-linejoin="round"/>`, 'Product: gold ring with emerald stone'));

/* --------------------------------------------------- sew design sketch */
save('sew-design.svg', svg(600, 800, `<defs><linearGradient id="sd-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF7F0"/><stop offset="1" stop-color="#F0EADF"/></linearGradient></defs>
	<rect width="600" height="800" fill="url(#sd-bg)"/>
	<g stroke="#D8CFC0" stroke-width="1">${Array.from({ length: 19 }, (_, i) => `<path d="M0 ${40 + i * 40}h600"/>`).join('')}</g>
	<g transform="translate(-30 -190) scale(1.1)">
	<path d="${smooth(columnPts)}" fill="#1F7A5A" opacity=".16"/>
	<g fill="none" stroke="#3A2E26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="${smooth(columnPts)}"/><path d="M268 364q32 8 64 0M268 372q32 8 64 0"/><path d="M300 700v152" stroke-dasharray="5 6"/><path d="M286 380q-6 220-14 470" opacity=".4"/><path d="M314 380q4 240 10 470" opacity=".4"/></g></g>
	<g font-family="Georgia, serif" font-size="17" fill="#3A2E26" font-style="italic">
	<path d="M338 100l84 -20M352 218l70 0M354 640l70 -20" stroke="#3A2E26" stroke-width="1.2"/>
	<text x="428" y="84">sweetheart bodice</text><text x="428" y="223">gold self-belt</text><text x="428" y="624">back slit</text>
	<text x="48" y="770" font-size="15" font-style="normal" letter-spacing="2">EMERALD DUCHESSE SATIN · FLOOR LENGTH</text></g>`, 'Sketch: a tailor-ready emerald column gown with annotations'));

/* ------------------------------------------------------------ invitation */
save('invitation.svg', svg(600, 840, `<defs>${goldGrad('iv-gold')}<linearGradient id="iv-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E3B2D"/><stop offset="1" stop-color="#07231B"/></linearGradient></defs>
	<rect width="600" height="840" fill="#2B2620"/><rect x="40" y="40" width="520" height="760" rx="4" fill="url(#iv-bg)"/>
	<rect x="62" y="62" width="476" height="716" fill="none" stroke="url(#iv-gold)" stroke-width="1.6"/><rect x="70" y="70" width="460" height="700" fill="none" stroke="url(#iv-gold)" stroke-width=".8"/>
	<g fill="url(#iv-gold)" font-family="Didot, 'Bodoni 72', Georgia, serif" text-anchor="middle">
	<text x="300" y="180" font-size="15" letter-spacing="5">THE TRUSTEES REQUEST THE PLEASURE</text>
	<text x="300" y="206" font-size="15" letter-spacing="5">OF YOUR COMPANY AT</text>
	<text x="300" y="300" font-size="54" font-style="italic">The Eko</text>
	<text x="300" y="360" font-size="54" font-style="italic">Heritage Ball</text>
	<path d="M240 400h120" stroke="url(#iv-gold)"/>
	<text x="300" y="450" font-size="19" letter-spacing="3">SATURDAY 14 NOVEMBER 2026</text>
	<text x="300" y="482" font-size="19" letter-spacing="3">SEVEN O'CLOCK IN THE EVENING</text>
	<text x="300" y="540" font-size="17" font-style="italic">The Grand Ballroom, Victoria Island, Lagos</text>
	<text x="300" y="640" font-size="22" letter-spacing="8">BLACK TIE</text>
	<text x="300" y="672" font-size="15" font-style="italic">Emerald &amp; gold encouraged</text></g>`, 'Invitation card: The Eko Heritage Ball, black tie'));
