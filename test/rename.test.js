// Rename (2026-10): the project is Tempoloon (Korean 템포룬), formerly "Attune".
// 1) no user-visible "Attune" left outside explicit historical/legacy mentions, 2) old 'attune.*' storage keys are migrated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planKeyMigration, migrateStorage, KEY_PREFIX as EXT_PREFIX } from '../extension/lib/migrate.js';
import { migrateLegacyKeys, KEY_PREFIX, LEGACY_PREFIX } from '../docs/js/storage.js';
import { STRINGS } from '../docs/js/i18n.js';
import { LABEL_KEY } from '../docs/js/labels.js';
import { SUGGEST_KEY } from '../docs/js/suggest.js';
import { SUGGEST_KEY as EXT_SUGGEST_KEY } from '../extension/lib/suggest.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const TEXT = new Set(['.html', '.js', '.mjs', '.json', '.md', '.css', '.svg', '.vtt', '.txt', '']);
// Folders that are history by design: earlier brand concepts were drawn under the old name.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test', join('brand', 'archive')]);
// A remaining mention is fine only when it is explicitly historical or a legacy alias kept for migration.
const ALLOWED_LINE = /formerly|이전 이름|legacy|LEGACY_PREFIX|used to be called|old [`"]?attune/i;
const OLD_NAME = /attune(?!s\b)/i; // "attunes" (the English verb in the tagline) is not the old brand name

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), rel = relative(ROOT, p);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(rel) && !name.startsWith('.')) walk(p, out); continue; }
    if (TEXT.has(extname(name))) out.push(p);
  }
  return out;
}

test('rename: no "Attune" left in the site, extension, MCP server, scripts or docs outside historical / legacy mentions', () => {
  const hits = [];
  for (const f of walk(ROOT)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (OLD_NAME.test(line) && !ALLOWED_LINE.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('rename: product names (EN Tempoloon, KO 템포룬), extension manifest, MCP identity, package names, repo links', () => {
  const m = JSON.parse(read('../extension/manifest.json'));
  assert.match(m.name, /^Tempoloon\b/);
  assert.match(m.action.default_title, /^Tempoloon\b/);
  assert.match(m.description, /Tempoloon/);
  assert.equal(m.version, '0.4.0');
  assert.equal(JSON.parse(read('../package.json')).name, 'tempoloon');
  assert.equal(JSON.parse(read('../mcp/package.json')).name, 'tempoloon-mcp-local');
  assert.match(read('../mcp/server.mjs'), /const SERVER_INFO = \{ name: 'tempoloon',/);
  assert.equal(STRINGS.en.brand, 'Tempoloon');
  assert.equal(STRINGS.ko.brand, '템포룬');
  // Korean UI names the product in Korean; the only Latin "Tempoloon" in KO is the legal footer (name + former name).
  const koLatin = Object.entries(STRINGS.ko).filter(([, v]) => typeof v === 'string' && v.includes('Tempoloon')).map(([k]) => k);
  assert.deepEqual(koLatin, ['lp_foot2']);
  const html = read('../docs/index.html');
  assert.match(html, /<title data-i18n="lp_title">Tempoloon — /);
  assert.match(html, /<meta property="og:title" content="Tempoloon — /);
  assert.match(html, /https:\/\/github\.com\/Json-Y-q\/tempoloon"/);
  assert.match(read('../README.md'), /formerly called "Attune"/);
  assert.match(read('../README.md'), /not a registered trademark/);
  assert.doesNotMatch(read('../README.md'), /not affiliated/);
  for (const f of ['../docs/img/logo.svg', '../docs/img/logo-dark.svg']) assert.match(read(f), /<title id="t">Tempoloon<\/title>/);
});

test('rename: every storage key uses the tempoloon. prefix (site and extension)', () => {
  assert.equal(KEY_PREFIX, 'tempoloon.'); assert.equal(EXT_PREFIX, 'tempoloon.'); assert.equal(LEGACY_PREFIX, 'attune.');
  for (const k of [LABEL_KEY, SUGGEST_KEY, EXT_SUGGEST_KEY]) assert.ok(k.startsWith('tempoloon.'), k);
  const bg = read('../extension/background.js'), ct = read('../extension/content.js');
  assert.match(bg, /const STORE = 'tempoloon\.ext\.labels\.v1'/);
  assert.match(bg, /const PREFS = 'tempoloon\.ext\.prefs\.v1'/);
  assert.match(ct, /const POS_KEY = 'tempoloon\.ext\.pos\.v1'/);
  assert.match(ct, /const PREFS_KEY = 'tempoloon\.ext\.prefs\.v1'/);
  // the worker migrates before it answers any message (the content script reads POS_KEY only after get_status)
  assert.match(bg, /import \{ migrateStorage \} from '\.\/lib\/migrate\.js'/);
  assert.match(bg, /const migrated = migrateStorage\(chrome\.storage\.local\)/);
  assert.match(bg, /\(async \(\) => \{\n\s+await migrated;/);
});

class FakeStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

test('site migration: attune.* localStorage keys move to tempoloon.* (labels, profile, settings kept; newer value wins; idempotent)', () => {
  const labels = JSON.stringify({ v: 1, labels: [{ ts: 1, level: 'overloaded' }] });
  const s = new FakeStorage({ 'attune.labels.v1': labels, 'attune.lang': 'ko', 'attune.mascot': 'false', 'attune.suggest.v1': '{"v":1}', 'tempoloon.suggest.v1': '{"v":1,"newer":true}', 'other.key': 'x' });
  assert.equal(migrateLegacyKeys(s), 3);
  assert.equal(s.getItem('tempoloon.labels.v1'), labels);
  assert.equal(s.getItem('tempoloon.lang'), 'ko');
  assert.equal(s.getItem('tempoloon.mascot'), 'false');
  assert.equal(s.getItem('tempoloon.suggest.v1'), '{"v":1,"newer":true}'); // never overwritten
  assert.equal(s.getItem('other.key'), 'x');
  assert.deepEqual([...s.m.keys()].filter((k) => k.startsWith('attune.')), []);
  assert.equal(migrateLegacyKeys(s), 0); // second run is a no-op
  assert.equal(migrateLegacyKeys(null), 0);
});

test('site migration runs automatically on first storage access: an old profile and old labels are still there after the rename', async () => {
  const { SAMPLE_PROFILE } = await import('../docs/js/profile.js');
  const labels = { v: 1, labels: [{ ts: 2, level: 'rising' }] };
  globalThis.localStorage = new FakeStorage({ 'attune.profile.v1': JSON.stringify(SAMPLE_PROFILE), 'attune.labels.v1': JSON.stringify(labels), 'attune.lang': 'ko' });
  try {
    const st = await import('../docs/js/storage.js?rename-test');
    assert.equal(st.loadProfile()?.levels?.style, SAMPLE_PROFILE.levels.style);
    assert.deepEqual(st.loadJSON(LABEL_KEY), labels);
    assert.equal(st.getLang(), 'ko');
    assert.equal(globalThis.localStorage.getItem('attune.profile.v1'), null);
  } finally { delete globalThis.localStorage; }
});

test('extension migration: chrome.storage.local attune.* → tempoloon.* (labels, prefs, position, suggestions), writes before removing', async () => {
  const labels = { v: 1, labels: [{ ts: 3, level: 'overloaded' }] };
  const data = { 'attune.ext.labels.v1': labels, 'attune.ext.prefs.v1': { level: 'rising' }, 'attune.ext.pos.v1': { right: 10, bottom: 90 }, 'attune.suggest.v1': { v: 1 }, 'tempoloon.ext.prefs.v1': { level: 'calm' }, unrelated: 1 };
  const plan = planKeyMigration(data);
  assert.deepEqual(Object.keys(plan.set).sort(), ['tempoloon.ext.labels.v1', 'tempoloon.ext.pos.v1', 'tempoloon.suggest.v1']);
  assert.equal(plan.remove.length, 4);
  const ops = [];
  const area = {
    store: structuredClone(data),
    async get(k) { assert.equal(k, null); return structuredClone(this.store); },
    async set(o) { ops.push('set'); Object.assign(this.store, o); },
    async remove(ks) { ops.push('remove'); for (const k of ks) delete this.store[k]; },
  };
  assert.equal(await migrateStorage(area), 3);
  assert.deepEqual(ops, ['set', 'remove']);
  assert.deepEqual(area.store['tempoloon.ext.labels.v1'], labels);
  assert.deepEqual(area.store['tempoloon.ext.prefs.v1'], { level: 'calm' }); // existing new value wins
  assert.deepEqual(area.store['tempoloon.ext.pos.v1'], { right: 10, bottom: 90 });
  assert.equal(area.store.unrelated, 1);
  assert.deepEqual(Object.keys(area.store).filter((k) => k.startsWith('attune.')), []);
  assert.equal(await migrateStorage(area), 0);
  assert.equal(await migrateStorage(undefined), 0);
});
