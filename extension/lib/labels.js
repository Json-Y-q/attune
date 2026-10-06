export const LABEL_SCHEMA_VERSION = 1;
export const MAX_LABELS = 500;
export const LOAD_LEVELS = ['calm', 'rising', 'overloaded'];
export function newSessionId(now = Date.now()) {
  return `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export const OUTCOMES = ['accept', 'reject', 'ignore'];
export function makeLabel({ sessionId, recentTurns = 0, signals = {}, source = 'mascot', kind = 'load', level = 'overloaded', note = '', now = Date.now(), id = null, origin = 'manual', outcome = null, sessionStart = null } = {}) {
  const lv = LOAD_LEVELS.includes(level) ? level : 'overloaded';
  const d = new Date(now);
  return {
    v: LABEL_SCHEMA_VERSION,
    id: id || `l_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date(now).toISOString(),
    sessionId: String(sessionId || newSessionId(now)).slice(0, 64),
    source: source === 'extension' ? 'extension' : 'mascot',
    kind: kind === 'suggest' ? 'suggest' : 'load',
    origin: origin === 'auto' ? 'auto' : 'manual',
    outcome: OUTCOMES.includes(outcome) ? outcome : null,
    dow: d.getDay(),
    hour: d.getHours(),
    sessionMin: typeof sessionStart === 'number' && sessionStart <= now ? Math.round((now - sessionStart) / 60000) : null,
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
    return 'The user reported rising cognitive load. Start with a 1–2 sentence summary, then the full details below under "Details". Do not drop content. Offer actions, never statements about the user.\n\n';
  }
  return 'The user reported high cognitive load. Start with a one-sentence summary, then the full details below under "Details" (do not drop content). One thing at a time, plain language, at most 2 options. Offer actions, never statements about the user.\n\n';
}
export function rewritePrompt() {
  return 'Please rewrite your last answer more shortly and simply.';
}
