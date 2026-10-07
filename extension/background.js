import { makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_SCHEMA_VERSION, prefixForLevel } from './lib/labels.js';
import { SUGGEST_KEY, normalizeSuggest, canSuggest, markShown, recordOutcome, setEnabled, setDailyMax, resetSuggest } from './lib/suggest.js';
import { migrateStorage } from './lib/migrate.js';

const STORE = 'tempoloon.ext.labels.v1';
const PREFS = 'tempoloon.ext.prefs.v1';
// Pre-rename data (formerly Attune: 'attune.*' keys) is moved to 'tempoloon.*' once per worker start, before any read.
const migrated = migrateStorage(chrome.storage.local).catch(() => 0);

async function getLabels() {
  const r = await chrome.storage.local.get(STORE);
  return normalizeLabels(r[STORE]?.labels);
}
async function setLabels(labels) {
  await chrome.storage.local.set({ [STORE]: { v: LABEL_SCHEMA_VERSION, labels } });
}
async function getPrefs() {
  const r = await chrome.storage.local.get(PREFS);
  return {
    instantApply: true, // mascot click = attach to next message (default ON)
    insertEnabled: true,
    pendingPrefix: '',
    level: 'calm', // last mascot pick (drives the mascot's colour and motion)
    sessionId: null,
    ...(r[PREFS] || {}),
  };
}
async function setPrefs(p) { await chrome.storage.local.set({ [PREFS]: p }); }
// Same daily cap + 1/3/7-day backoff as the site (lib/suggest.js is a verbatim copy of docs/js/suggest.js).
async function getSuggest() { return normalizeSuggest((await chrome.storage.local.get(SUGGEST_KEY))[SUGGEST_KEY]); }
async function setSuggest(st) { await chrome.storage.local.set({ [SUGGEST_KEY]: st }); }
const SUGGEST_TEXT = { loop: 'See the key point first? I can ask for a one-line restatement.', short: 'Want a short summary first?' };

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    await migrated;
    if (msg?.type === 'record_load') {
      const prefs = await getPrefs();
      const sid = prefs.sessionId || `ext_${Date.now().toString(36)}`;
      if (!prefs.sessionId) { prefs.sessionId = sid; }
      const level = msg.level || 'overloaded';
      const label = makeLabel({
        sessionId: sid,
        recentTurns: msg.recentTurns ?? 0,
        signals: { ...(msg.signals || {}), overloaded: level === 'overloaded' },
        level,
        origin: 'manual',
        sessionStart: prefs.sessionStart ?? null,
      });
      if (!prefs.sessionStart) prefs.sessionStart = Date.now();
      const labels = appendLabel(await getLabels(), label);
      await setLabels(labels);
      let pendingPrefix = '';
      prefs.level = ['calm', 'rising', 'overloaded'].includes(level) ? level : 'overloaded'; // mascot colour/motion on every tab
      if (prefs.instantApply !== false && prefs.insertEnabled !== false) {
        pendingPrefix = prefixForLevel(level);
        prefs.pendingPrefix = pendingPrefix;
      }
      await setPrefs(prefs);
      sendResponse({ ok: true, count: labels.length, label, prefs, pendingPrefix });
      return;
    }
    if (msg?.type === 'get_status') {
      const sg = await getSuggest();
      sendResponse({ ok: true, count: (await getLabels()).length, prefs: await getPrefs(), suggest: sg, gate: canSuggest(sg, Date.now()) });
      return;
    }
    if (msg?.type === 'suggest_check') {
      // Content script saw a trigger (e.g. near-repeat user messages). Show only if the policy allows.
      const sg = await getSuggest();
      const gate = canSuggest(sg, Date.now());
      if (!gate.ok) { sendResponse({ ok: false, gate }); return; }
      await setSuggest(markShown(sg, Date.now()));
      sendResponse({ ok: true, text: SUGGEST_TEXT[msg.trigger] || SUGGEST_TEXT.short });
      return;
    }
    if (msg?.type === 'suggest_outcome') {
      const outcome = ['accept', 'reject', 'ignore'].includes(msg.outcome) ? msg.outcome : null;
      if (!outcome) { sendResponse({ ok: false }); return; }
      await setSuggest(recordOutcome(await getSuggest(), outcome, Date.now()));
      const prefs = await getPrefs();
      const label = makeLabel({ sessionId: prefs.sessionId || `ext_${Date.now().toString(36)}`, kind: 'suggest', level: 'rising', origin: 'auto', outcome, sessionStart: prefs.sessionStart ?? null, signals: { trigger: msg.trigger || 'short', host: msg.host || '' } });
      await setLabels(appendLabel(await getLabels(), label));
      let pendingPrefix = '';
      if (outcome === 'accept' && prefs.insertEnabled !== false) { pendingPrefix = prefixForLevel('rising'); prefs.pendingPrefix = pendingPrefix; await setPrefs(prefs); }
      sendResponse({ ok: true, pendingPrefix });
      return;
    }
    if (msg?.type === 'set_suggest') {
      let sg = await getSuggest();
      if (typeof msg.enabled === 'boolean') sg = setEnabled(sg, msg.enabled);
      if (msg.dailyMax != null) sg = setDailyMax(sg, msg.dailyMax);
      if (msg.reset) sg = resetSuggest(sg);
      await setSuggest(sg);
      sendResponse({ ok: true, suggest: sg, gate: canSuggest(sg, Date.now()) });
      return;
    }
    if (msg?.type === 'clear_pending') {
      const prefs = await getPrefs();
      prefs.pendingPrefix = '';
      if (['calm', 'rising', 'overloaded'].includes(msg.level)) prefs.level = msg.level; // Undo shows the previous level again
      await setPrefs(prefs);
      sendResponse({ ok: true, prefs });
      return;
    }
    if (msg?.type === 'export_labels') {
      sendResponse({ ok: true, json: exportLabelsJSON(await getLabels()) });
      return;
    }
    if (msg?.type === 'clear_labels') {
      await setLabels([]);
      sendResponse({ ok: true, count: 0 });
      return;
    }
    if (msg?.type === 'set_prefs') {
      const prefs = { ...(await getPrefs()), ...msg.prefs };
      await setPrefs(prefs);
      sendResponse({ ok: true, prefs });
      return;
    }
    sendResponse({ ok: false, error: 'unknown' });
  })();
  return true;
});
