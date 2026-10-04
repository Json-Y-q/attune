// Static consistency checks that stand in for a browser: i18n parity, referenced keys and element ids exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, t } from '../docs/js/i18n.js';

const read = (p) => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8');
const PAGES = { 'index.html': 'js/landing.js', 'onboarding.html': 'js/onboarding.js', 'demo.html': 'js/demo.js' };
const keysIn = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

test('EN and KO define exactly the same keys with the same value types', () => {
  const en = Object.keys(STRINGS.en).sort();
  const ko = Object.keys(STRINGS.ko).sort();
  assert.deepEqual(ko, en);
  for (const k of en) {
    assert.equal(typeof STRINGS.ko[k], typeof STRINGS.en[k], k);
    if (Array.isArray(STRINGS.en[k])) assert.equal(STRINGS.ko[k].length, STRINGS.en[k].length, k);
  }
});

test('KO and EN strings use the same {placeholders}', () => {
  const ph = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join() : '');
  for (const k of Object.keys(STRINGS.en)) assert.equal(ph(STRINGS.ko[k]), ph(STRINGS.en[k]), k);
});

test('t() interpolates and falls back', () => {
  assert.equal(t('en', 'step_of', { n: 2 }), 'Task 2 of 3');
  assert.equal(t('ko', 'step_of', { n: 2 }), '과제 2 / 3');
  assert.equal(t('en', 'no_such_key'), 'no_such_key');
});

for (const [page, script] of Object.entries(PAGES)) {
  test(`${page}: every data-i18n / data-i18n-attr key exists`, () => {
    const html = read(page);
    const keys = [
      ...keysIn(html, /data-i18n="([^"]+)"/g),
      ...keysIn(html, /data-i18n-attr="[^"]*?:([\w]+)(?:;[^"]*)?"/g),
    ];
    assert.ok(keys.length > 10);
    for (const k of keys) assert.ok(k in STRINGS.en, `${page}: missing key ${k}`);
  });

  test(`${page}: every $('id') used by ${script} exists in the page`, () => {
    const html = read(page);
    const ids = new Set(keysIn(read(script), /\$\('([\w-]+)'\)/g));
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `${page}: missing #${id}`);
  });

  test(`${page}: ids are unique and a11y basics present`, () => {
    const html = read(page);
    const ids = keysIn(html, /\sid="([^"]+)"/g);
    assert.equal(new Set(ids).size, ids.length);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<html lang=/);
    assert.match(html, /class="skip"/);
  });
}

test('t() keys used in JS exist in the dictionary', () => {
  for (const f of ['js/onboarding.js', 'js/demo.js', 'js/ui.js', 'js/landing.js']) {
    const src = read(f);
    for (const k of keysIn(src, /\btr\('([a-z0-9_]+)'/g)) assert.ok(k in STRINGS.en, `${f}: ${k}`);
  }
});

test('no innerHTML / eval / network calls in shipped JS', () => {
  for (const f of ['profile', 'engine', 'transform', 'adapter', 'i18n', 'storage', 'ui', 'onboarding', 'demo', 'landing']) {
    const src = read(`js/${f}.js`);
    assert.doesNotMatch(src, /innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
  }
});

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
for (const page of Object.keys(PAGES)) {
  test(`${page}: inline English text matches the EN dictionary (works without JS)`, () => {
    const html = read(page);
    for (const m of html.matchAll(/<(\w+)([^>]*?)\sdata-i18n="(\w+)"([^>]*)>([^<]+)<\/\1>/g)) {
      if (/data-n=/.test(m[2] + m[4])) continue;
      assert.equal(unescape(m[5]), STRINGS.en[m[3]], `${page}: ${m[3]}`);
    }
  });

  test(`${page}: no third-party hosts; local links resolve`, () => {
    const html = read(page);
    for (const m of html.matchAll(/\s(?:href|src|srcset)="(https?:)?\/\/([^/"]+)/g)) assert.equal(m[2], 'github.com', `${page}: external host ${m[2]}`);
    for (const m of html.matchAll(/\s(?:href|src)="([\w./-]+)"/g)) {
      assert.doesNotThrow(() => readFileSync(new URL(`../docs/${m[1]}`, import.meta.url)), `${page}: broken link ${m[1]}`);
    }
  });
}
