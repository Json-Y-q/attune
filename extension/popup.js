const $ = (id) => document.getElementById(id);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'get_status' });
  $('status').textContent = `Labels: ${s.count}\nInstant: ${s.prefs.instantApply !== false}\nInsert: ${s.prefs.insertEnabled !== false}\nPending: ${s.prefs.pendingPrefix ? 'yes' : 'no'}`;
  $('instant').checked = s.prefs.instantApply !== false;
  $('insert').checked = s.prefs.insertEnabled !== false;
  $('sg-on').checked = s.suggest?.enabled !== false;
  $('sg-max').value = String(s.suggest?.dailyMax ?? 3);
  const g = s.gate || {};
  $('sg-status').textContent = g.reason === 'off' ? 'Automatic suggestions are off. The mascot still works.'
    : g.reason === 'backoff' ? `Quiet until ${new Date(g.until).toLocaleString()}.`
      : g.reason === 'cap' ? 'Today’s limit is reached.' : `Up to ${g.remaining ?? 0} more today.`;
}
$('sg-on').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_suggest', enabled: e.target.checked }); refresh(); };
$('sg-max').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_suggest', dailyMax: Number(e.target.value) }); refresh(); };
$('sg-reset').onclick = async () => { await chrome.runtime.sendMessage({ type: 'set_suggest', reset: true }); refresh(); };
document.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'record_load', level: b.dataset.lv, recentTurns: 0, signals: { from: 'popup' } });
  refresh();
}));
$('export').onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: 'export_labels' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
  a.download = `tempoloon-ext-labels-${Date.now()}.json`; a.click();
};
$('pos-reset').onclick = async () => { await chrome.storage.local.remove('tempoloon.ext.pos.v1'); $('status').textContent = 'Mascot is back above the chat box.'; };
$('clear').onclick = async () => { await chrome.runtime.sendMessage({ type: 'clear_labels' }); refresh(); };
$('instant').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { instantApply: e.target.checked } }); refresh(); };
$('insert').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { insertEnabled: e.target.checked } }); refresh(); };
refresh();
