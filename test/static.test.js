// Static consistency checks that stand in for a browser: i18n parity, referenced keys and element ids exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, t } from '../docs/js/i18n.js';

const read = (p) => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8');
const PAGES = { 'index.html': 'js/landing.js', 'onboarding.html': 'js/onboarding.js', 'demo.html': 'js/demo.js', 'architecture.html': 'js/architecture.js' };
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
  for (const f of ['profile', 'engine', 'transform', 'adapter', 'i18n', 'storage', 'ui', 'onboarding', 'demo', 'landing', 'media', 'charts', 'stylecard', 'architecture']) {
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
      if (m[1].startsWith('media/')) continue; // optional assets, inside inert <template> slots
      assert.doesNotThrow(() => readFileSync(new URL(`../docs/${m[1]}`, import.meta.url)), `${page}: broken link ${m[1]}`);
    }
  });
}

test('architecture page: both SVG variants, status labels, and the HealthKit on-device statement', () => {
  const html = read('architecture.html');
  assert.equal((html.match(/<svg class="ar-svg/g) || []).length, 2);
  for (const k of ['ar_impl', 'ar_plan', 'ar_badge_impl', 'ar_badge_plan']) assert.match(html, new RegExp(`data-i18n="${k}"`));
  for (const lang of ['en', 'ko']) {
    assert.match(STRINGS[lang].ar_d_phone, /HealthKit/);
    assert.match(STRINGS[lang].ar_d_phone, lang === 'en' ? /on-device[^.]*not a remote API/i : /원격 API가 아니라/);
  }
  assert.equal(STRINGS.en.ar_impl, 'Implemented in this prototype');
});

test('sample HRV summary: matches the shown excerpt, the schema keys and the engine', async () => {
  const raw = read('data/sample-hrv.json');
  const sample = JSON.parse(raw);
  const schema = JSON.parse(read('data/hrv-summary.schema.json'));
  assert.deepEqual(Object.keys(sample).sort(), Object.keys(schema.properties).sort());
  for (const k of schema.required) assert.ok(k in sample, k);
  assert.equal(sample.source, 'virtual');
  assert.ok(read('architecture.html').includes(raw.trim().replace(/"/g, '"').split('\n')[1].trim()));
  const { computeSettings } = await import('../docs/js/engine.js');
  const { SAMPLE_PROFILE } = await import('../docs/js/profile.js');
  const s = computeSettings(SAMPLE_PROFILE, sample);
  assert.ok(s.step >= 1);
});

test('style card: reflects levels, both languages, no medical claims', async () => {
  const { styleCard } = await import('../docs/js/stylecard.js');
  const { SAMPLE_PROFILE } = await import('../docs/js/profile.js');
  for (const lang of ['en', 'ko']) {
    for (let a = 1; a <= 5; a++) for (const style of ['prose', 'summary', 'bullets', 'chunks']) {
      const card = styleCard({ levels: { amount: a, pace: 6 - a, style } }, lang);
      assert.ok(card.includes(STRINGS[lang].sc_amount[a - 1]));
      assert.ok(card.includes(STRINGS[lang].sc_pace[5 - a]));
      assert.ok(card.includes(STRINGS[lang][`sc_style_${style}`]));
    }
  }
  assert.match(styleCard(SAMPLE_PROFILE, 'en'), /not medical advice/);
});

test('media slots: inert templates with lazy images, captions and alt text keys; assets folder documented', () => {
  const html = read('onboarding.html');
  const slots = html.match(/<figure class="ob-media[\s\S]*?<\/figure>/g) || [];
  assert.equal(slots.length, 4);
  for (const sl of slots) {
    assert.match(sl, /data-media-ready="false"/);
    assert.match(sl, /class="ob-ph" aria-hidden="true"><svg/);
    assert.match(sl, /<template data-media-template>/);
    if (sl.includes('<video')) { assert.match(sl, /<track kind="captions"/); assert.match(sl, /muted loop playsinline preload="none" poster=/); } else { assert.match(sl, /loading="lazy"/); assert.match(sl, /alt:md_alt_/); }
  }
  readFileSync(new URL('../docs/media/README.md', import.meta.url));
  readFileSync(new URL('../docs/media/hero.en.vtt', import.meta.url));
});
