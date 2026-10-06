// Label log for self-reported cognitive load. Pure functions: no DOM, no network.
// Schema is shared by the conversation page, Chrome extension prototype, and local MCP server.
// Values are ASSUMPTIONS for a prototype; not validated.

export const LABEL_KEY = 'attune.labels.v1';
export const LABEL_SCHEMA_VERSION = 1;
export const MAX_LABELS = 500;
export const MAX_RECENT_TURNS = 8;
export const LOAD_LEVELS = Object.freeze(['calm', 'rising', 'overloaded']);
export const OUTCOMES = Object.freeze(['accept', 'reject', 'ignore']);

/**
 * @typedef {{
 *   v: number, id: string, ts: string, sessionId: string,
 *   source: 'web'|'extension'|'mcp'|'mascot',
 *   kind: 'overloaded'|'adaptation'|'loop'|'load'|'suggest',
 *   level?: 'calm'|'rising'|'overloaded',
 *   recentTurns: number, signals: object, note?: string,
 *   origin: 'manual'|'auto', outcome: null|'accept'|'reject'|'ignore',
 *   dow: number, hour: number, sessionMin: number|null
 * }} LoadLabel
 */

export function newSessionId(now = Date.now()) {
  return `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeLabel({
  sessionId, recentTurns = 0, signals = {}, source = 'mascot', kind = 'load',
  level = 'overloaded', note = '', now = Date.now(), id = null,
  origin = 'manual', outcome = null, sessionStart = null,
} = {}) {
  const sid = String(sessionId || newSessionId(now)).slice(0, 64);
  const turns = Math.max(0, Math.min(MAX_RECENT_TURNS * 4, Number(recentTurns) || 0));
  const lv = LOAD_LEVELS.includes(level) ? level : 'overloaded';
  const d = new Date(now);
  const sessionMin = typeof sessionStart === 'number' && sessionStart <= now ? Math.round((now - sessionStart) / 60000) : null;
  return {
    v: LABEL_SCHEMA_VERSION,
    id: id || `l_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    sessionId: sid,
    source: ['web', 'extension', 'mcp', 'mascot'].includes(source) ? source : 'mascot',
    kind: ['overloaded', 'adaptation', 'loop', 'load', 'suggest'].includes(kind) ? kind : 'load',
    origin: origin === 'auto' ? 'auto' : 'manual',
    outcome: OUTCOMES.includes(outcome) ? outcome : null,
    dow: d.getDay(), // local weekday 0=Sun
    hour: d.getHours(), // local hour
    sessionMin,
    level: lv,
    recentTurns: turns,
    signals: signals && typeof signals === 'object' ? { ...signals, level: lv } : { level: lv },
    ...(note ? { note: String(note).slice(0, 200) } : {}),
  };
}

export function appendLabel(list, label) {
  const next = Array.isArray(list) ? list.slice() : [];
  next.push(label);
  if (next.length > MAX_LABELS) next.splice(0, next.length - MAX_LABELS);
  return next;
}

export function normalizeLabels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object' && typeof x.ts === 'string' && typeof x.sessionId === 'string');
}

export function exportLabelsJSON(list) {
  return JSON.stringify({
    v: LABEL_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    count: Array.isArray(list) ? list.length : 0,
    labels: normalizeLabels(list),
  }, null, 2);
}

/** Mascot pose + partner deltas for a self-reported level. */
export function poseForLevel(level) {
  if (level === 'overloaded') return { zone: 'high', face: 'tired', puff: 1.16, sweat: 2, breathing: true, shake: 0.35 };
  if (level === 'rising') return { zone: 'mid', face: 'tense', puff: 1.07, sweat: 1, breathing: false, shake: 0.1 };
  return { zone: 'calm', face: 'calm', puff: 1, sweat: 0, breathing: false, shake: 0 };
}

export function deltasForLevel(level) {
  if (level === 'overloaded') return { amountDelta: -2, paceDelta: -1, optionsMax: 2, chip: 'short', userPaceCap: -1 };
  if (level === 'rising') return { amountDelta: -1, paceDelta: 0, optionsMax: 3, chip: 'lighter', userPaceCap: 0 };
  return { amountDelta: 0, paceDelta: 0, optionsMax: null, chip: null, userPaceCap: null }; // calm restores
}
