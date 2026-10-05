// "Overload -> adjustment -> recovery" story: a deterministic timeline of VIRTUAL values (no sensors, no model).
// storyAt(ms) is a pure function so the page, the tests and the recorded video all show exactly the same thing.
// About 42 seconds: each stage dwells long enough to read, and the changes between stages are slow and eased.
import { THRESHOLDS } from './engine.js?v=395c86ef';

export const STORY_MS = 42000;
export const DEFAULT_LEVELS = Object.freeze({ amount: 4, pace: 4 });

/** Stages in order. `at` = start time in ms. */
export const PHASES = Object.freeze([
  { id: 'long', at: 0 }, // calm: long continuous replies start
  { id: 'rising', at: 6000 }, // the load slowly builds (orange)
  { id: 'overload', at: 15000 }, // balloon swells to the edge (magenta), held
  { id: 'adjust', at: 22000 }, // Attune lightens: the balloon lets the air out
  { id: 'checkpoint', at: 26000 }, // checkpoint card + offer to rest
  { id: 'rest', at: 29500 }, // slow breathing, virtual clock jumps
  { id: 'resume', at: 34000 }, // resume card, answers relax
  { id: 'recovered', at: 38000 }, // back to the defaults
]);

// [ms, value] keyframes, eased between them
const LOAD = [[0, 16], [6000, 22], [15000, 62], [18500, 84], [21000, 92], [22000, 94], [22800, 92], [26000, 78], [29500, 66], [34000, 46], [38000, 30], [42000, 14]];
const AMOUNT = [[0, 4], [22000, 4], [23500, 2], [34000, 2], [36000, 3], [38000, 3], [40000, 4], [42000, 4]];
const PACE = AMOUNT;
// Balloon size (1 = normal): swells towards bursting, hangs there, then deflates fast ("pshh"), dips below 1, settles.
const PUFF = [[0, 1], [6000, 1.02], [15000, 1.15], [18500, 1.27], [21000, 1.33], [22000, 1.36], [22200, 1.36], [23000, 0.93], [24200, 1], [42000, 1]];
// Tremble amount 0..1 (CSS animation amplitude), only while the load is high
const SHAKE = [[0, 0], [8000, 0], [15000, 0.3], [18500, 0.7], [22000, 1], [22300, 0.9], [23000, 0], [42000, 0]];

const ease = (x) => x * x * (3 - 2 * x);
function sample(frames, ms) {
  if (ms <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (ms <= frames[i][0]) {
      const [t0, v0] = frames[i - 1];
      const [t1, v1] = frames[i];
      return v0 + (v1 - v0) * ease((ms - t0) / (t1 - t0));
    }
  }
  return frames[frames.length - 1][1];
}
export const zoneOf = (load) => (load >= THRESHOLDS.breakNow ? 'high' : load >= THRESHOLDS.breakSoon ? 'mid' : 'calm');

/** Moments when the shown AI reply changes (a new reply is typed out from there). */
// Each reply is typed out from its start at `cps` characters per second: the first one is long and fast, the later ones shorter and slower.
export const REPLIES = Object.freeze([
  { at: 0, amount: 4, style: 'prose', cps: 22 },
  { at: 22000, amount: 2, style: 'bullets', cps: 12 },
  { at: 30000, amount: 2, style: 'summary', cps: 12 },
  { at: 34000, amount: 3, style: 'prose', cps: 15 },
  { at: 38000, amount: 4, style: 'prose', cps: 20 },
]);
export const REPLY_STARTS = Object.freeze(REPLIES.map((r) => r.at));
const styleAt = (ms) => (ms >= 22000 && ms < 30000 ? 'bullets' : ms >= 30000 && ms < 34000 ? 'summary' : 'prose');

/** State of the story at time `ms` (clamped to 0..STORY_MS). */
export function storyAt(msIn) {
  const ms = Math.max(0, Math.min(STORY_MS, msIn));
  const phase = [...PHASES].reverse().find((p) => ms >= p.at).id;
  const loadF = sample(LOAD, ms);
  const load = Math.round(loadF);
  const amount = Math.round(sample(AMOUNT, ms));
  const pace = Math.round(sample(PACE, ms));
  const recovered = ms >= 38000 && load < THRESHOLDS.breakSoon && amount === DEFAULT_LEVELS.amount && pace === DEFAULT_LEVELS.pace;
  const puff = +sample(PUFF, ms).toFixed(3);
  const shake = +sample(SHAKE, ms).toFixed(2);
  const sweat = ms < 9000 ? 0 : ms < 15000 ? 1 : ms < 18000 ? 2 : ms < 22800 ? 3 : ms < 24200 ? 1 : 0;
  const air = ms >= 22000 && ms < 23800 ? +((ms - 22000) / 1800).toFixed(3) : 0; // 0..1 progress of the escaping air
  // The face follows the story; thickness of the arcs grows continuously with the load.
  let face = 'calm';
  if (ms >= 38000) face = 'bright';
  else if (ms >= 24200) face = 'ease';
  else if (ms >= 22800) face = 'tired'; // the breath out
  else if (ms >= 17000) face = 'strain'; // squinting at the edge
  else if (ms >= 8000) face = 'tense';
  const reply = [...REPLIES].reverse().find((r) => ms >= r.at);
  return {
    ms, phase, load, zone: zoneOf(load), amount, pace, style: styleAt(ms), recovered,
    peak: ms >= 15000 && ms < 24200, puff, shake, sweat, air, face,
    arc: +(0.7 + 0.8 * Math.min(1, Math.max(0, (loadF - 15) / 80))).toFixed(2), // arc thickness factor 0.7..1.5
    breathing: ms >= 24200 && !recovered,
    showCheckpoint: ms >= 26000 && ms < 34000,
    resting: ms >= 29500 && ms < 34000,
    showResume: ms >= 34000,
    chip: ms >= 22500 && ms < 38500,
    reply, // the reply on screen now: { at, amount, style, cps } (typing runs from `at`)
    virtualMinutes: Math.round(sample([[0, 0], [26000, 38], [29500, 38], [34000, 53], [42000, 55]], ms)),
  };
}
