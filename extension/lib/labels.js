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
/*
 * Load notes put in front of the user's next message. Compact on purpose (they sit in the chat box): one line, no line
 * break (an inserted line break can send in rich composers), action-only (what the reply should look like, never a
 * statement about the user). Light/calm = no note. NOTE_MAX caps the length per level (checked by tests).
 */
export const NOTE_MAX = Object.freeze({ calm: 0, rising: 80, overloaded: 110 });
const NOTES = Object.freeze({
  en: {
    rising: '[Tempoloon: medium] 1-2 sentence summary first, full details kept below.',
    overloaded: '[Tempoloon: heavy] 1-line summary first, all details under "Details"; one step at a time, max 2 options.',
  },
  ko: {
    rising: '[템포룬: 중간] 1~2문장 요약 먼저, 전체 내용은 아래에 유지.',
    overloaded: '[템포룬: 무거움] 한 줄 요약 먼저, 전체 내용은 "자세히" 아래에. 한 번에 하나씩, 선택지 최대 2개.',
  },
});
/** Note for a level ('' for calm/light), with one trailing space so the user's text can follow. lang 'ko' | 'en'. */
export function prefixForLevel(level, lang = 'en') {
  if (level === 'calm') return '';
  const t = NOTES[lang === 'ko' ? 'ko' : 'en'];
  return `${level === 'rising' ? t.rising : t.overloaded} `;
}
/** Short request placed after the note only when the box is empty AND the page already has an assistant answer. */
const REWRITE = Object.freeze({ en: 'Redo the last answer this way.', ko: '마지막 답을 이 방식으로 다시 써 주세요.' });
export function rewritePrompt(lang = 'en') {
  return REWRITE[lang === 'ko' ? 'ko' : 'en'];
}
/** Every rewrite text we may have placed (both languages), so a later pick/Undo recognises it as ours. */
export const REWRITE_FILLS = Object.freeze([REWRITE.en, REWRITE.ko]);
/** Fill for an empty box: the rewrite request only when a previous assistant answer exists; '' in a new/empty chat. */
export function fillFor({ hasAnswer = false, lang = 'en' } = {}) {
  return hasAnswer ? rewritePrompt(lang) : '';
}
