import { makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_SCHEMA_VERSION, prefixForLevel } from './lib/labels.js';

const STORE = 'attune.ext.labels.v1';
const PREFS = 'attune.ext.prefs.v1';

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
    sessionId: null,
    ...(r[PREFS] || {}),
  };
}
async function setPrefs(p) { await chrome.storage.local.set({ [PREFS]: p }); }

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
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
      });
      const labels = appendLabel(await getLabels(), label);
      await setLabels(labels);
      let pendingPrefix = '';
      if (prefs.instantApply !== false && prefs.insertEnabled !== false) {
        pendingPrefix = prefixForLevel(level);
        prefs.pendingPrefix = pendingPrefix;
      }
      await setPrefs(prefs);
      sendResponse({ ok: true, count: labels.length, label, prefs, pendingPrefix });
      return;
    }
    if (msg?.type === 'get_status') {
      sendResponse({ ok: true, count: (await getLabels()).length, prefs: await getPrefs() });
      return;
    }
    if (msg?.type === 'clear_pending') {
      const prefs = await getPrefs();
      prefs.pendingPrefix = '';
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
