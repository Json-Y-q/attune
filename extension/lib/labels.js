// Copied subset of docs/js/labels.js for the MV3 extension (no stamped imports). Keep in sync manually or via docs.
export const LABEL_KEY = 'attune.labels.v1';
export const LABEL_SCHEMA_VERSION = 1;
export const MAX_LABELS = 500;
export function newSessionId(now = Date.now()) {
  return `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export function makeLabel({ sessionId, recentTurns = 0, signals = {}, source = 'extension', kind = 'overloaded', note = '', now = Date.now(), id = null } = {}) {
  return {
    v: LABEL_SCHEMA_VERSION,
    id: id || `l_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    sessionId: String(sessionId || newSessionId(now)).slice(0, 64),
    source: 'extension',
    kind: ['overloaded', 'adaptation', 'loop'].includes(kind) ? kind : 'overloaded',
    recentTurns: Math.max(0, Number(recentTurns) || 0),
    signals: signals && typeof signals === 'object' ? { ...signals } : {},
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
  return JSON.stringify({ v: LABEL_SCHEMA_VERSION, exportedAt: new Date().toISOString(), count: Array.isArray(list) ? list.length : 0, labels: normalizeLabels(list) }, null, 2);
}
export function buildPrefix({ confirm = true } = {}) {
  const body = 'The user reported high cognitive load. Keep the next answer short (about 3 key lines), one thing at a time, plain language. At most 2 options. Suggestive tone, not diagnostic.';
  return confirm ? `[Attune load note — review before send]\n${body}\n\n` : `${body}\n\n`;
}
