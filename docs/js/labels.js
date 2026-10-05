// Label log for self-reported cognitive load. Pure functions: no DOM, no network.
// Schema is shared by the conversation page, Chrome extension prototype, and local MCP server.
// Values are ASSUMPTIONS for a prototype; not validated.

export const LABEL_KEY = 'attune.labels.v1';
export const LABEL_SCHEMA_VERSION = 1;
export const MAX_LABELS = 500;
export const MAX_RECENT_TURNS = 8;

/**
 * One overload (or related) event.
 * @typedef {{
 *   v: number,
 *   id: string,
 *   ts: string,
 *   sessionId: string,
 *   source: 'web'|'extension'|'mcp',
 *   kind: 'overloaded'|'adaptation'|'loop',
 *   recentTurns: number,
 *   signals: object,
 *   note?: string
 * }} LoadLabel
 */

/** @returns {string} */
export function newSessionId(now = Date.now()) {
  return `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {LoadLabel} */
export function makeLabel({
  sessionId,
  recentTurns = 0,
  signals = {},
  source = 'web',
  kind = 'overloaded',
  note = '',
  now = Date.now(),
  id = null,
} = {}) {
  const sid = String(sessionId || newSessionId(now)).slice(0, 64);
  const turns = Math.max(0, Math.min(MAX_RECENT_TURNS * 4, Number(recentTurns) || 0));
  return {
    v: LABEL_SCHEMA_VERSION,
    id: id || `l_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    sessionId: sid,
    source: ['web', 'extension', 'mcp'].includes(source) ? source : 'web',
    kind: ['overloaded', 'adaptation', 'loop'].includes(kind) ? kind : 'overloaded',
    recentTurns: turns,
    signals: signals && typeof signals === 'object' ? { ...signals } : {},
    ...(note ? { note: String(note).slice(0, 200) } : {}),
  };
}

/** Append and trim. Returns the new array (does not touch storage). */
export function appendLabel(list, label) {
  const next = Array.isArray(list) ? list.slice() : [];
  next.push(label);
  if (next.length > MAX_LABELS) next.splice(0, next.length - MAX_LABELS);
  return next;
}

/** Validate a stored list; drop broken rows. */
export function normalizeLabels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object' && typeof x.ts === 'string' && typeof x.sessionId === 'string');
}

/** Pretty JSON for download / clipboard. */
export function exportLabelsJSON(list) {
  return JSON.stringify({
    v: LABEL_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    count: Array.isArray(list) ? list.length : 0,
    labels: normalizeLabels(list),
  }, null, 2);
}
