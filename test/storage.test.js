import test from 'node:test';
import assert from 'node:assert/strict';
import { clearProfile, getLang, loadProfile, saveProfile, setLang } from '../docs/js/storage.js';
import { SAMPLE_PROFILE } from '../docs/js/profile.js';

test('default language is English even for a Korean browser locale', () => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'ko-KR' }, configurable: true });
  assert.equal(getLang(), 'en');
});

test('chosen language persists; junk values fall back to English', () => {
  setLang('ko');
  assert.equal(getLang(), 'ko');
  setLang('en');
  assert.equal(getLang(), 'en');
  setLang('fr');
  assert.equal(getLang(), 'en');
});

test('profile save / load / clear round trip (in-memory fallback in Node)', () => {
  assert.equal(loadProfile(), null);
  saveProfile(SAMPLE_PROFILE);
  assert.equal(loadProfile().levels.style, 'summary');
  clearProfile();
  assert.equal(loadProfile(), null);
  saveProfile({ version: 1, junk: true });
  assert.equal(loadProfile(), null); // invalid stored data is ignored
});
