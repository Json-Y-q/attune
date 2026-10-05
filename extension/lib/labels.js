export const LABEL_SCHEMA_VERSION = 1;
export const MAX_LABELS = 500;
export const LOAD_LEVELS = ['calm', 'rising', 'overloaded'];
export function newSessionId(now = Date.now()) {
  return `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export function makeLabel({ sessionId, recentTurns = 0, signals = {}, source = 'mascot', kind = 'load', level = 'overloaded', note = '', now = Date.now(), id = null } = {}) {
  const lv = LOAD_LEVELS.includes(level) ? level : 'overloaded';
  return {
    v: LABEL_SCHEMA_VERSION,
    id: id || `l_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    sessionId: String(sessionId || newSessionId(now)).slice(0, 64),
    source: 'mascot',
    kind: 'load',
    level: lv,
    recentTurns: Math.max(0, Number(recentTurns) || 0),
    signals: { ...(signals || {}), level: lv },
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
export function prefixForLevel(level) {
  if (level === 'calm') return '';
  if (level === 'rising') {
    return 'The user reported rising cognitive load. Keep the next answer a bit shorter: lead with the gist, plain language, at most 3 options.\n\n';
  }
  return 'The user reported high cognitive load. Keep the next answer short (about 3 key lines), one thing at a time, plain language. At most 2 options. Suggestive tone, not diagnostic.\n\n';
}
export function rewritePrompt() {
  return 'Please rewrite your last answer more shortly and simply.';
}
