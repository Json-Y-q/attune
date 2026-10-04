// Optional mascot: the speech-bubble + brain-arc logo with a simple dot-eye face. The logo itself is untouched.
// Geometry is plain data, so Node can write the SVG files (scripts/gen-mascot.mjs) and the browser can draw the same shapes.
// Not a depiction of a person and not a reading of anyone's feelings: it is an illustration of the meter state.

export const BUBBLE = 'M176 112 C176 148 150 168 110 168 Q84 172 52 196 Q58 174 68 165 C42 159 24 138 24 112';
/** The whole head as one closed shape (arcs on top, bubble below): one flat fill, so there is no half-and-half split line. */
export const HEAD = 'M24 112 A23.6 23.6 0 0 1 34.2 74 A27.4 27.4 0 0 1 67.9 43.1 A38.5 38.5 0 0 1 132.1 43.1 A27.4 27.4 0 0 1 165.8 74 A23.6 23.6 0 0 1 176 112 C176 148 150 168 110 168 Q84 172 52 196 Q58 174 68 165 C42 159 24 138 24 112Z';
const ARCS = [
  ['M24 112 A23.6 23.6 0 0 1 34.2 74', 11.4],
  ['M34.2 74 A27.4 27.4 0 0 1 67.9 43.1', 14.2],
  ['M67.9 43.1 A38.5 38.5 0 0 1 132.1 43.1', 17.1],
  ['M132.1 43.1 A27.4 27.4 0 0 1 165.8 74', 19.9],
  ['M165.8 74 A23.6 23.6 0 0 1 176 112', 22.8],
];
export const ZONE_HEX = Object.freeze({ calm: '#2F5DA8', mid: '#B45F06', high: '#B3124F' });
const INK = '#0D1B2A';
/** Arc thickness is a second cue besides colour: thin = calm, medium = rising, thick = break zone. */
export const ARC_SCALE = Object.freeze({ calm: 0.7, mid: 1, high: 1.3 });

export const FACES = ['calm', 'tense', 'strain', 'tired', 'ease', 'bright'];

const n = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
const stroke = (d, w = 4.5, extra = {}) => n('path', { d, fill: 'none', stroke: INK, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'mc-stroke', ...extra });
const dot = (cx, cy, r) => n('circle', { cx, cy, r, fill: INK, class: 'mc-fill' }); // plain dot (used by eye())

/** Eye drawings for the dot-based faces. Only the eye shape changes between characters, never the body. */
function eye(cx, cy, r, style) {
  switch (style) {
    case 'oval': return n('ellipse', { cx, cy, rx: +(r * 0.72).toFixed(1), ry: +(r * 1.3).toFixed(1), fill: INK, class: 'mc-fill' });
    case 'round': return n('circle', { cx, cy, r: +(r * 1.22).toFixed(1), fill: INK, class: 'mc-fill' });
    case 'wide': return dot(cx + (cx < 100 ? -7 : 7), cy, r);
    default: return dot(cx, cy, r);
  }
}
function face(kind, eyes = 'dot') {
  const dot = (cx, cy, r) => eye(cx, cy, r, eyes);
  switch (kind) {
    case 'tense': // lowered eyes, worried brows, flat mouth
      return [dot(82, 117, 5.5), dot(118, 117, 5.5), stroke('M70 107 L90 101', 3.8), stroke('M130 107 L110 101', 3.8), stroke('M90 136 Q100 132 110 136', 4.5)];
    case 'strain': // squinting chevron eyes, pressed brows, tight wavy mouth (about to burst)
      return [stroke('M70 108 L92 117 L70 124', 5), stroke('M130 108 L108 117 L130 124', 5), stroke('M68 99 L92 104', 3.8), stroke('M132 99 L108 104', 3.8), stroke('M86 138 q3 -5 6 0 t6 0 t6 0 t6 0', 4.2)];
    case 'tired': // heavy lids as short lines, small wavy mouth
      return [stroke('M73 116 H91', 6), stroke('M109 116 H127', 6), stroke('M86 136 q3.5 -4 7 0 t7 0 t7 0', 4.2)];
    case 'ease': // soft closed-smile eyes, small smile
      return [stroke('M74 114 Q82 106 90 114', 4.5), stroke('M110 114 Q118 106 126 114', 4.5), stroke('M88 131 Q100 141 112 131', 4.5)];
    case 'bright': // big dot eyes with highlights, wide smile
      return [dot(82, 111, 6.5), dot(118, 111, 6.5), n('circle', { cx: 84.4, cy: 108.6, r: 2.2, fill: '#fff', class: 'mc-hl' }), n('circle', { cx: 120.4, cy: 108.6, r: 2.2, fill: '#fff', class: 'mc-hl' }), stroke('M83 128 Q100 148 117 128', 4.8)];
    default: // calm
      return [dot(82, 112, 5.5), dot(118, 112, 5.5), stroke('M88 130 Q100 140 112 130', 4.5)];
  }
}
/** Neutral characters: colour tint, eye shape and one small accessory. No body, no age or gender cues. */
export const VARIANTS = Object.freeze([
  { id: 'a', tint: '#3E8E5A', eyes: 'round', accessory: 'glasses' },
  { id: 'b', tint: '#C79A2B', eyes: 'oval', accessory: 'headphones' },
  { id: 'c', tint: '#7B68B8', eyes: 'dot', accessory: 'sprout' },
  { id: 'd', tint: '#6B7F8F', eyes: 'wide', accessory: 'none' },
]);
const ACCESSORIES = Object.freeze({
  glasses: () => [n('circle', { cx: 82, cy: 113, r: 15, fill: 'none', stroke: INK, 'stroke-width': 3.6, class: 'mc-stroke' }), n('circle', { cx: 118, cy: 113, r: 15, fill: 'none', stroke: INK, 'stroke-width': 3.6, class: 'mc-stroke' }), stroke('M97 112 H103', 3.6)],
  headphones: () => [stroke('M12 110 A88 88 0 0 1 188 110', 7), n('rect', { x: 4, y: 98, width: 20, height: 40, rx: 9, fill: INK, class: 'mc-fill' }), n('rect', { x: 176, y: 98, width: 20, height: 40, rx: 9, fill: INK, class: 'mc-fill' })],
  sprout: () => [stroke('M100 34 V18', 4), n('path', { d: 'M100 20 q-18 -2 -22 -15 q18 -2 22 15z', fill: '#3E8E5A', class: 'mc-leaf' }), n('path', { d: 'M100 20 q18 -2 22 -15 q-18 -2 -22 15z', fill: '#3E8E5A', class: 'mc-leaf' })],
  none: () => [],
});
const drop = (x, y, delay) => n('path', { d: `M${x} ${y} q8 14 0 20 q-8 -6 0 -20z`, fill: ZONE_HEX.calm, class: 'mc-sweat', style: `animation-delay:${delay}s` });
const DROPS = [[152, 70, 0], [38, 78, 1.1], [166, 106, 2.2]];
/** Air escaping when the balloon lets go ("pshh"): three small puffs drifting up and to the right, progress t = 0..1. */
const airAttrs = (t, i) => ({ cx: +(172 + t * (24 + i * 8) + i * 4).toFixed(1), cy: +(70 - t * (20 + i * 10) - i * 12).toFixed(1), r: +(4 + i * 1.6 + t * 3).toFixed(1), opacity: +Math.max(0, 0.75 * (1 - t)).toFixed(2) });

const bodyTransform = (puff) => `translate(100 120) scale(${+(puff ?? 1).toFixed(3)}) translate(-100 -120)`;
const arcWidth = (w, pose) => +(w * (pose.arc ?? ARC_SCALE[pose.zone])).toFixed(1);

/**
 * pose: { zone:'calm'|'mid'|'high', face, puff (balloon scale, 1 = normal), arc (arc thickness factor), shake (0..1 tremble),
 *         sweat (0-3 drops), air (0..1 progress of escaping air, 0 = none), breathing (bool), variant?, tint?, plain? } -> element tree
 */
export function mascotTree(pose, { title = null } = {}) {
  const v = pose.variant ? VARIANTS.find((x) => x.id === pose.variant) ?? null : pose.tint ? { tint: pose.tint, eyes: 'dot', accessory: 'none' } : null;
  const arcs = ARCS.map(([d, w], i) => n('path', { d, fill: 'none', stroke: ZONE_HEX[pose.zone], 'stroke-width': arcWidth(w, pose), 'stroke-linecap': 'round', class: `mc-arc z-${pose.zone}`, 'data-i': i, 'data-w': w }));
  const body = n('g', { class: 'mc-body', transform: bodyTransform(pose.puff) }, [
    n('path', v ? { d: HEAD, fill: v.tint, 'fill-opacity': 0.26, stroke: 'none', class: 'mc-tint' } : { d: HEAD, fill: 'none', stroke: 'none', class: 'mc-head' }),
    n('path', { d: BUBBLE, fill: 'none', stroke: ZONE_HEX[pose.zone], 'stroke-width': 12, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: `mc-rim z-${pose.zone}` }), // same colour as the arcs: one outline, no colour split
    ...arcs,
    ...(pose.plain ? [] : face(pose.face, v?.eyes)),
    ...(v && !pose.plain ? ACCESSORIES[v.accessory]() : []),
  ]);
  const extras = [];
  const drops = Math.min(3, Math.max(0, pose.sweat ?? 0));
  for (let i = 0; i < drops; i++) extras.push(drop(...DROPS[i]));
  if ((pose.air ?? 0) > 0) for (let i = 0; i < 3; i++) extras.push(n('circle', { ...airAttrs(pose.air, i), fill: 'none', stroke: INK, 'stroke-width': 2.4, class: 'mc-air mc-stroke', 'data-i': i }));
  if (pose.face === 'bright') extras.push(n('path', { d: 'M158 52 Q160.2 62.8 171 65 Q160.2 67.2 158 78 Q155.8 67.2 145 65 Q155.8 62.8 158 52Z', fill: ZONE_HEX.mid, class: 'mc-spark' }));
  const inner = n('g', { class: pose.breathing ? 'mc-breath mc-breathe' : 'mc-breath' }, [body]);
  const kids = [...(title ? [n('title', {}, [title])] : []), n('g', { class: 'mc-shake' }, [inner]), ...extras];
  return n('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 200 200', class: 'mc', style: `overflow:visible;--shake:${pose.shake ?? 0}` }, kids);
}

/** Pose for a story state (see story.js). Size, trembling, sweat, face and arc thickness carry the state as well as colour. */
export function poseFor(s) {
  return { zone: s.zone, face: s.face, puff: s.puff, arc: s.arc, shake: s.shake, sweat: s.sweat, air: s.air, breathing: s.breathing };
}
/** Four still frames (also used when motion is reduced). They show the swelling too, without any movement. */
export const STILL_POSES = Object.freeze({
  calm: { zone: 'calm', face: 'calm', puff: 1, arc: 0.7, shake: 0, sweat: 0, air: 0, breathing: false },
  build: { zone: 'mid', face: 'tense', puff: 1.15, arc: 1.05, shake: 0, sweat: 2, air: 0, breathing: false },
  heavy: { zone: 'high', face: 'strain', puff: 1.34, arc: 1.45, shake: 0, sweat: 3, air: 0, breathing: false },
  recovered: { zone: 'calm', face: 'bright', puff: 1, arc: 0.7, shake: 0, sweat: 0, air: 0, breathing: false },
});

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function toSvgString(t) {
  const a = Object.entries(t.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  if (!t.children.length) return `<${t.tag}${a}/>`;
  return `<${t.tag}${a}>${t.children.map((c) => (typeof c === 'string' ? esc(c) : toSvgString(c))).join('')}</${t.tag}>`;
}
export function toDom(t, doc = document) {
  const el = doc.createElementNS('http://www.w3.org/2000/svg', t.tag);
  for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, String(v));
  for (const c of t.children) el.append(typeof c === 'string' ? doc.createTextNode(c) : toDom(c, doc));
  return el;
}
const structKey = (p) => [p.face, p.variant || '', p.tint || '', p.plain ? 1 : 0, p.sweat | 0, (p.air ?? 0) > 0 ? 1 : 0, p.breathing ? 1 : 0, p.zone].join('|');
/** Draw the mascot inside `box`. If only the continuous values changed (size, thickness, tremble, air) the existing SVG is
 *  updated in place, so CSS animations (tremble, breathing, sweat) keep running instead of restarting every frame. */
export function renderMascot(box, pose) {
  const key = structKey(pose);
  const old = box.firstElementChild;
  if (old && box.dataset.mcKey === key) {
    old.style.setProperty('--shake', String(pose.shake ?? 0));
    old.querySelector('.mc-body')?.setAttribute('transform', bodyTransform(pose.puff));
    old.querySelectorAll('.mc-arc').forEach((a) => a.setAttribute('stroke-width', String(arcWidth(Number(a.dataset.w), pose))));
    old.querySelectorAll('.mc-air').forEach((c) => { const at = airAttrs(pose.air, Number(c.dataset.i)); for (const [k, v] of Object.entries(at)) c.setAttribute(k, String(v)); });
    return;
  }
  const svg = toDom(mascotTree(pose));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  box.replaceChildren(svg);
  box.dataset.mcKey = key;
}
