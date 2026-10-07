// localStorage wrapper. Everything stays in the browser; falls back to memory if storage is blocked.
import { validateProfile } from './profile.js?v=647d0f36';

const PROFILE_KEY = 'tempoloon.profile.v1';
const LANG_KEY = 'tempoloon.lang';
const memory = new Map();

// The project was renamed (formerly "Attune"). Keys saved before the rename start with LEGACY_PREFIX.
// GitHub Pages keeps the same origin (json-y-q.github.io), so the old data is still in this browser.
export const KEY_PREFIX = 'tempoloon.';
export const LEGACY_PREFIX = 'attune.';
/** Move every legacy 'attune.*' key to 'tempoloon.*' (profile, labels, settings) so nothing is lost.
 *  A value already stored under the new key wins. Returns the number of keys copied. Idempotent. */
export function migrateLegacyKeys(s) {
  if (!s) return 0;
  const legacy = [];
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(LEGACY_PREFIX)) legacy.push(k); }
  let copied = 0;
  for (const k of legacy) {
    const nk = KEY_PREFIX + k.slice(LEGACY_PREFIX.length);
    const v = s.getItem(k);
    if (v !== null && s.getItem(nk) === null) { s.setItem(nk, v); copied++; }
    if (s.getItem(nk) !== null) s.removeItem(k); // only drop the old key once the new one is safely there
  }
  return copied;
}
let migrated = false;
function backend() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__tempoloon_probe', '1');
    s.removeItem('__tempoloon_probe');
    if (!migrated) { migrated = true; try { migrateLegacyKeys(s); } catch { /* keep going with whatever is there */ } }
    return s;
  } catch {
    return null;
  }
}
const read = (k) => { const s = backend(); return s ? s.getItem(k) : (memory.get(k) ?? null); };
const write = (k, v) => { const s = backend(); if (s) s.setItem(k, v); else memory.set(k, v); };
const remove = (k) => { const s = backend(); if (s) s.removeItem(k); else memory.delete(k); };

export function loadProfile() {
  try {
    const p = JSON.parse(read(PROFILE_KEY));
    return validateProfile(p).ok ? p : null;
  } catch {
    return null;
  }
}
export const saveProfile = (p) => write(PROFILE_KEY, JSON.stringify(p));
export const clearProfile = () => remove(PROFILE_KEY);

/** English is the default; Korean only if the user chose it via the toggle (persisted). */
export function getLang() {
  const saved = read(LANG_KEY);
  return saved === 'ko' ? 'ko' : 'en';
}
export const setLang = (l) => write(LANG_KEY, l);

/* generic helpers for small JSON values (resume card, preferences); same localStorage-or-memory backend */
export const loadJSON = (key) => { try { return JSON.parse(read(key)); } catch { return null; } };
export const saveJSON = (key, value) => write(key, JSON.stringify(value));
export const removeKey = (key) => remove(key);
