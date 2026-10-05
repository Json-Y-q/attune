// Service worker: label log in chrome.storage.local. No network.
import { makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_SCHEMA_VERSION } from './lib/labels.js';

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
  return { insertEnabled: true, confirmBeforeInsert: true, sessionId: null, ...(r[PREFS] || {}) };
}
async function setPrefs(p) {
  await chrome.storage.local.set({ [PREFS]: p });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'record_overload') {
      const prefs = await getPrefs();
      const sid = prefs.sessionId || `ext_${Date.now().toString(36)}`;
      if (!prefs.sessionId) { prefs.sessionId = sid; await setPrefs(prefs); }
      const label = makeLabel({
        sessionId: sid,
        recentTurns: msg.recentTurns ?? 0,
        signals: msg.signals || { overloaded: true },
        source: 'extension',
        kind: 'overloaded',
      });
      const labels = appendLabel(await getLabels(), label);
      await setLabels(labels);
      sendResponse({ ok: true, count: labels.length, label, prefs });
      return;
    }
    if (msg?.type === 'get_status') {
      const labels = await getLabels();
      const prefs = await getPrefs();
      sendResponse({ ok: true, count: labels.length, prefs });
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
