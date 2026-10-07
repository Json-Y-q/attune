// Pure logic for the extension's floating mascot widget (no DOM, no chrome.* calls), so Node tests can cover it.
// The drawing itself comes from lib/mascot.js, a verbatim copy of docs/js/mascot.js (same head the website uses).
// Wording rule: describe what the NEXT REPLY will look like (an action), never how the person is.

export const LEVELS = Object.freeze(['calm', 'rising', 'overloaded']);
/** Load colours, same scale as the site meter: calm blue, rising orange, break magenta. */
export const LOAD_HEX = Object.freeze({ calm: '#2F5DA8', rising: '#B45F06', overloaded: '#B3124F' });
const ZONE = Object.freeze({ calm: 'calm', rising: 'mid', overloaded: 'high' });

export const normLevel = (lv) => (LEVELS.includes(lv) ? lv : lv === 'high' || lv === 'break' ? 'overloaded' : 'calm');

/** Mix a #RRGGBB colour toward white. amount = share of the colour (0 = white, 1 = colour). */
export function tintHex(hex, amount = 0.22) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(255 + (c - 255) * Math.min(1, Math.max(0, amount))));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Level -> colours + motion name. The outline is the load colour; the head is a solid light tint of the same colour. */
export function stateFor(level) {
  const lv = normLevel(level);
  const outline = LOAD_HEX[lv];
  return { level: lv, zone: ZONE[lv], outline, fill: tintHex(outline, lv === 'calm' ? 0.2 : 0.26), motion: lv === 'overloaded' ? 'strain' : lv === 'rising' ? 'tense' : 'breathe' };
}

/**
 * Mascot pose (see lib/mascot.js mascotTree). Break state is deliberately exaggerated: swollen, three sweat drops, strong tremble.
 * reduced = prefers-reduced-motion: same size/face/sweat (still frame), but no tremble and no breathing.
 */
export function poseFor(level, { reduced = false, mini = false } = {}) {
  const s = stateFor(level);
  const base = {
    calm: { face: 'calm', puff: 1, arc: 0.7, sweat: 0, shake: 0, breathing: true },
    rising: { face: 'tense', puff: 1.1, arc: 1.05, sweat: 1, shake: 0.25, breathing: false },
    overloaded: { face: 'strain', puff: 1.24, arc: 1.45, sweat: 3, shake: 0.9, breathing: false },
  }[s.level];
  const pose = { zone: s.zone, ...base, air: 0, tint: s.fill };
  if (mini) { pose.puff = Math.min(pose.puff, 1.08); pose.shake = 0; pose.breathing = false; pose.sweat = Math.min(pose.sweat, 1); }
  if (reduced) { pose.shake = 0; pose.breathing = false; }
  return pose;
}

/**
 * "pshh" recovery: the swollen head lets the air out. t = 0..1 progress. Puff drops quickly, dips a little below the
 * target size, settles; three air puffs drift away. Going back to calm shows the bright (relieved-looking) face while it settles.
 */
export function deflatePose(fromLevel, t, toLevel = 'calm') {
  const p = Math.min(1, Math.max(0, t));
  const start = poseFor(fromLevel).puff;
  const target = poseFor(toLevel);
  const dip = target.puff - 0.06;
  const puff = p < 0.55 ? start + (dip - start) * (p / 0.55) : dip + (target.puff - dip) * ((p - 0.55) / 0.45);
  const toCalm = normLevel(toLevel) === 'calm';
  return { ...target, face: toCalm ? 'bright' : target.face, puff: +puff.toFixed(3), air: +p.toFixed(3), breathing: false, sweat: toCalm ? (p < 0.3 ? 1 : 0) : target.sweat };
}
/** Swell when load goes up: overshoot then settle on the target size. t = 0..1. */
export function inflatePose(fromLevel, toLevel, t) {
  const p = Math.min(1, Math.max(0, t));
  const a = poseFor(fromLevel).puff;
  const target = poseFor(toLevel);
  const over = target.puff + 0.08;
  const puff = p < 0.6 ? a + (over - a) * (p / 0.6) : over + (target.puff - over) * ((p - 0.6) / 0.4);
  return { ...target, puff: +puff.toFixed(3) };
}

/** Page/browser language -> 'ko' | 'en'. Korean when either the page or the browser says ko. */
export function langFrom(pageLang, navLang) {
  return /^ko\b/i.test(String(pageLang || '')) || /^ko\b/i.test(String(navLang || '')) ? 'ko' : 'en';
}

/** How many of 5 preview bars stay on (expected reply length), and the typing pace. */
export const PREVIEW_SHAPE = Object.freeze({
  calm: { lines: 5, pace: 'normal' },
  rising: { lines: 3, pace: 'steady' },
  overloaded: { lines: 1, pace: 'slow' },
});

const T = {
  en: {
    next: { calm: 'Next reply: normal length (~5 lines)', rising: 'Next reply: ~3 lines, summary first', overloaded: 'Next reply: 1-line summary first' },
    now: { calm: 'Replies now: normal length', rising: 'Replies now: summary first (~3 lines)', overloaded: 'Replies now: 1-line summary first' },
    detail: { calm: 'Usual detail and pace', rising: 'Full details kept below', overloaded: 'Details folded below, one step at a time' },
    face: { calm: 'Light: normal replies', rising: 'Medium: summary first', overloaded: 'Heavy: one-line summary first' },
    mascot: 'Tempoloon: choose how the next reply should look',
    tip: 'Click to choose · drag to move',
    tipPick: 'Click to apply · preview only',
    group: 'Choose the next reply style',
    undo: 'Undo', copy: 'Copy',
    applied: { calm: 'Back to normal replies', rising: 'Next message: summary first', overloaded: 'Next message: 1-line summary first' },
  },
  ko: {
    next: { calm: '다음 답: 보통 길이(~5줄)', rising: '다음 답: ~3줄, 요약 먼저', overloaded: '다음 답: 한 줄 요약 먼저' },
    now: { calm: '지금 답: 보통 길이', rising: '지금 답: 요약 먼저(~3줄)', overloaded: '지금 답: 한 줄 요약 먼저' },
    detail: { calm: '평소 분량과 속도', rising: '전체 내용은 아래에 유지', overloaded: '자세한 내용은 아래에 접어서, 한 번에 하나씩' },
    face: { calm: '가벼움: 보통 답', rising: '중간: 요약 먼저', overloaded: '무거움: 한 줄 요약 먼저' },
    mascot: '템포룬: 다음 답을 어떻게 받을지 고르기',
    tip: '클릭해서 고르기 · 끌어서 옮기기',
    tipPick: '클릭하면 적용 · 지금은 미리보기',
    group: '다음 답 방식 고르기',
    undo: '되돌리기', copy: '복사',
    applied: { calm: '보통 답으로 돌아감', rising: '다음 메시지: 요약 먼저', overloaded: '다음 메시지: 한 줄 요약 먼저' },
  },
};

/** UI strings for a language (fallback English). */
export function strings(lang) { return T[lang === 'ko' ? 'ko' : 'en']; }

/**
 * Hover preview text. mode 'next' = hovering a face choice (what the next reply would be);
 * mode 'now' = hovering the mascot (the current reply style). Preview only: nothing changes until a click.
 */
export function previewFor(level, lang = 'en', mode = 'next') {
  const lv = normLevel(level);
  const s = strings(lang);
  return { level: lv, title: (mode === 'now' ? s.now : s.next)[lv], detail: s.detail[lv], tip: mode === 'now' ? s.tip : s.tipPick, ...PREVIEW_SHAPE[lv] };
}

/** Every user-visible string of the widget (for the no-diagnosis phrase test). */
export function allStrings() {
  const out = [];
  const walk = (v) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(T);
  return out;
}

export const SIZE = 60;
export const MARGIN = 16;
export const DEFAULT_BOTTOM = 88;

/**
 * Bottom offset (px) so the mascot sits above the chat composer instead of on top of it.
 * composer = the composer's bounding rect {top,left,right,bottom} or null. If the composer reaches into the mascot's
 * column at the right edge, lift the mascot above the composer's top edge; otherwise keep the default.
 */
export function dockBottom({ vw, vh, composer = null, size = SIZE, right = MARGIN, gap = 12, base = DEFAULT_BOTTOM }) {
  let bottom = base;
  if (composer && Number.isFinite(composer.top)) {
    const colLeft = vw - right - size - 8;
    const overlapsX = composer.right > colLeft && composer.left < vw - right + 8;
    const mascotTop = vh - bottom - size;
    const overlapsY = composer.top < vh - bottom + gap && composer.bottom > mascotTop;
    if (overlapsX && overlapsY) bottom = Math.max(base, Math.round(vh - composer.top + gap));
  }
  return Math.min(Math.max(8, bottom), Math.max(8, vh - size - 8));
}

/** Keep a dragged position {right,bottom} fully on screen. */
export function clampPos(pos, { vw, vh, size = SIZE }) {
  const r = Number(pos?.right); const b = Number(pos?.bottom);
  if (!Number.isFinite(r) || !Number.isFinite(b)) return null;
  return { right: Math.round(Math.min(Math.max(4, r), Math.max(4, vw - size - 4))), bottom: Math.round(Math.min(Math.max(4, b), Math.max(4, vh - size - 4))) };
}

export const CHIP_GAP = 12;
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/**
 * Where the "note ready / Undo" chip goes (fixed, viewport px). It must not sit under the mascot (the cursor covers it there)
 * and must never cover the composer (its send / voice buttons). mascot / composer = bounding rects {left,top,right,bottom};
 * chip = {w,h}. Preferred: to the LEFT of the mascot, gap >= CHIP_GAP, bottom-aligned with the mascot, which when docked is the
 * composer's top edge minus the gap. No room on the left: above the mascot (or below it near the top of the screen).
 * Always inside the viewport; lifted above the composer if it would touch it. Returns {left, top, side}.
 */
export function chipPos({ vw, vh, mascot, chip, composer = null, gap = CHIP_GAP, margin = 4 }) {
  const w = Math.max(0, Math.min(Number(chip?.w) || 0, vw - 2 * margin));
  const h = Math.max(0, Number(chip?.h) || 0);
  const cx = (x) => Math.min(Math.max(margin, x), Math.max(margin, vw - w - margin));
  const cy = (y) => Math.min(Math.max(margin, y), Math.max(margin, vh - h - margin));
  const box = (l, t) => ({ left: l, top: t, right: l + w, bottom: t + h });
  const pad = (r) => (r ? { left: r.left - gap, top: r.top - gap, right: r.right + gap, bottom: r.bottom + gap } : null);
  const m = pad(mascot); const c = pad(composer);
  let side = 'left';
  let left = mascot.left - gap - w;
  let top = mascot.bottom - h;
  if (left < margin) {
    side = 'above';
    left = mascot.right - w;
    top = mascot.top - gap - h;
    if (top < margin) { side = 'below'; top = mascot.bottom + gap; }
  }
  left = cx(left); top = cy(top);
  if (c && overlap(box(left, top), c)) top = cy(composer.top - gap - h); // never over the composer / its buttons
  if (overlap(box(left, top), m)) { // clamping or lifting pushed it into the mascot: put it above both
    top = cy(Math.min(mascot.top, composer ? composer.top : Infinity) - gap - h);
    if (side === 'left') side = 'above';
  }
  return { left: Math.round(left), top: Math.round(top), side };
}

/* ---------- never send: composer text + keys (pure, covered by node --test) ----------
 * The extension NEVER sends a message. It only puts a single-line note in front of the composer text; the user sends.
 * Rich composers (ProseMirror/tiptap on grok.com and claude.ai) turn an inserted line break into an Enter key press
 * (prosemirror-view readDOMChange: a change that "looksLikeEnter" -> handleKeyDown(Enter)), and Enter = send. So no text
 * the extension inserts may contain a line-break character, and the user's own (possibly multi-line) draft is never re-typed:
 * we only insert at the very start, or delete our own leading note.
 */
/** Characters a composer may treat as Enter when inserted: CR, LF, VT, FF, NEL, LINE/PARAGRAPH SEPARATOR. */
export const SUBMIT_CHARS = /[\r\n\v\f\u0085\u2028\u2029]/;
const SUBMIT_RUN = /[ \t]*[\r\n\v\f\u0085\u2028\u2029]+[ \t]*/g;
/** Flatten text to one line (line breaks -> one space). Safe to insert into any composer. */
export function oneLine(text) { return String(text ?? '').replace(SUBMIT_RUN, ' '); }
const norm = (s) => String(s ?? '').replace(/\u00a0/g, ' ').trim();

/**
 * Plan the composer edit for a pick. current = composer text now; oldNote = note placed by the previous pick (or '');
 * note = new note ('' for light/calm); fill = request used when the box is empty; fills = every fill text we may have placed.
 * Returns { clear, remove, insert }: clear = empty the box (it only holds our own note + fill); remove = our old leading note
 * to delete; insert = one-line text to put at the very start. Nothing here can send.
 */
export function planPick({ current = '', oldNote = '', note = '', fill = '', fills = [] } = {}) {
  const cur = norm(current);
  const old = norm(oneLine(oldNote));
  const next = oneLine(note);
  const plan = { clear: false, remove: '', insert: '' };
  const hadOld = Boolean(old) && cur.startsWith(old);
  let rest = hadOld ? cur.slice(old.length).trim() : cur;
  const ours = (t) => !t || [fill, ...fills].map((f) => norm(oneLine(f))).includes(t);
  if (hadOld && old === norm(next) && !ours(rest)) return plan; // same note already in front of the user's text
  if (hadOld) { if (ours(rest)) { plan.clear = true; rest = ''; } else plan.remove = old; }
  if (!norm(next)) return plan;
  if (!rest) plan.insert = oneLine(next + (fill || ''));
  else if (!rest.startsWith(norm(next))) plan.insert = next.endsWith(' ') ? next : `${next} `;
  return plan;
}
/** Plan the composer edit for Undo: take our note (and an auto fill) back out, leave the user's own text alone. */
export function planUndo({ current = '', note = '', fills = [] } = {}) {
  const cur = norm(current);
  const n = norm(oneLine(note));
  if (!n || !cur.startsWith(n)) return { clear: false, remove: '', insert: '' };
  const rest = cur.slice(n.length).trim();
  const ours = !rest || fills.map((f) => norm(oneLine(f))).includes(rest);
  return { clear: ours, remove: ours ? '' : n, insert: '' };
}

/**
 * What a key pressed INSIDE the widget does. The content script stops every such key from reaching the page
 * (so the chat composer never sees Escape/Enter/arrows/Space typed in the widget) and then applies this action.
 * type: 'close' (Escape, panel open: close + focus the mascot) | 'hide' (Escape: hide the preview) | 'focus' (arrows/Home/End
 * move between faces) | 'native' (Enter/Space: the focused widget button's own click = open faces / pick / Undo) | 'none'.
 * There is no 'send' or 'submit' action: picking only places a note in the composer.
 */
export function keyAction(key, { open = false, index = -1, count = 3, repeat = false } = {}) {
  if (key === 'Escape' || key === 'Esc') return { type: open ? 'close' : 'hide', preventDefault: true };
  const onFace = open && index >= 0 && count > 0;
  const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[key];
  if (move) return onFace ? { type: 'focus', index: (index + move + count) % count, preventDefault: true } : { type: 'none', preventDefault: true };
  if (key === 'Home' || key === 'End') return onFace ? { type: 'focus', index: key === 'Home' ? 0 : count - 1, preventDefault: true } : { type: 'none', preventDefault: false };
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') return repeat ? { type: 'none', preventDefault: true } : { type: 'native', preventDefault: false };
  return { type: 'none', preventDefault: false };
}
