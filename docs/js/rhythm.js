// Work-rhythm aggregation from local labels. Pure, no DOM, no network.
// Facts only (counts, times, rates). Never a diagnosis.

export const MIN_EVENTS = 5;
export const BAND_HOURS = 3;
export const BANDS = 24 / BAND_HOURS; // 8 bands: 0-3, 3-6, ... 21-24
export const SESSION_BINS = Object.freeze([0, 10, 20, 30, 45, 60]); // lower bounds in minutes; last bin is 60+

const LOAD = new Set(['rising', 'overloaded']);
const localParts = (l) => {
  if (Number.isInteger(l.dow) && Number.isInteger(l.hour)) return { dow: l.dow, hour: l.hour };
  const d = new Date(l.ts);
  return Number.isNaN(d.getTime()) ? null : { dow: d.getDay(), hour: d.getHours() };
};

/** A "load went up" event: manual rising/overloaded presses and accepted auto offers. */
export const isLoadEvent = (l) => (l.kind === 'suggest'
  ? l.outcome === 'accept'
  : (l.kind === 'load' || l.kind === 'overloaded') && LOAD.has(l.level ?? 'overloaded'));

export function sessionBin(min) {
  let idx = 0;
  for (let i = 0; i < SESSION_BINS.length; i++) if (min >= SESSION_BINS[i]) idx = i;
  return idx;
}

/**
 * @param {object[]} labels
 * @returns {{ total:number, events:number, enough:boolean, heat:number[][], heatMax:number, peak:{dow:number,band:number}|null,
 *   session:number[], sessionPeak:number|null, medianMin:number|null,
 *   suggest:{shown:number, accept:number, reject:number, ignore:number, rate:number|null} }}
 */
export function aggregateRhythm(labels) {
  const list = Array.isArray(labels) ? labels.filter((l) => l && typeof l === 'object') : [];
  const heat = Array.from({ length: 7 }, () => Array(BANDS).fill(0));
  const session = Array(SESSION_BINS.length).fill(0);
  const mins = [];
  let events = 0;
  const suggest = { shown: 0, accept: 0, reject: 0, ignore: 0, rate: null };
  for (const l of list) {
    if (l.origin === 'auto' && ['accept', 'reject', 'ignore'].includes(l.outcome)) { suggest.shown++; suggest[l.outcome]++; }
    if (!isLoadEvent(l)) continue;
    const p = localParts(l);
    if (!p) continue;
    events++;
    heat[p.dow][Math.floor(p.hour / BAND_HOURS)]++;
    if (Number.isFinite(l.sessionMin) && l.sessionMin >= 0) { session[sessionBin(l.sessionMin)]++; mins.push(l.sessionMin); }
  }
  if (suggest.shown) suggest.rate = suggest.accept / suggest.shown;
  let heatMax = 0; let peak = null;
  heat.forEach((row, dow) => row.forEach((v, band) => { if (v > heatMax) { heatMax = v; peak = { dow, band }; } }));
  const sMax = Math.max(0, ...session);
  mins.sort((a, b) => a - b);
  return {
    total: list.length, events, enough: events >= MIN_EVENTS, heat, heatMax, peak,
    session, sessionPeak: sMax ? session.indexOf(sMax) : null,
    medianMin: mins.length ? mins[Math.floor((mins.length - 1) / 2)] : null,
    suggest,
  };
}
