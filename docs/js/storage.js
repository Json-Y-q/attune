// localStorage wrapper. Everything stays in the browser; falls back to memory if storage is blocked.
import { validateProfile } from './profile.js?v=03a17e33';

const PROFILE_KEY = 'attune.profile.v1';
const LANG_KEY = 'attune.lang';
const memory = new Map();

function backend() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__attune_probe', '1');
    s.removeItem('__attune_probe');
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
