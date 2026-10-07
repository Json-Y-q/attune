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
    mascot: 'Attune: choose how the next reply should look',
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
    mascot: 'Attune: 다음 답을 어떻게 받을지 고르기',
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
