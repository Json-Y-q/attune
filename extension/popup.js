const $ = (id) => document.getElementById(id);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'get_status' });
  $('status').textContent = `Labels: ${s.count}\nInstant: ${s.prefs.instantApply !== false}\nInsert: ${s.prefs.insertEnabled !== false}\nPending: ${s.prefs.pendingPrefix ? 'yes' : 'no'}`;
  $('instant').checked = s.prefs.instantApply !== false;
  $('insert').checked = s.prefs.insertEnabled !== false;
}
document.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'record_load', level: b.dataset.lv, recentTurns: 0, signals: { from: 'popup' } });
  refresh();
}));
$('export').onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: 'export_labels' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
  a.download = `attune-ext-labels-${Date.now()}.json`; a.click();
};
$('clear').onclick = async () => { await chrome.runtime.sendMessage({ type: 'clear_labels' }); refresh(); };
$('instant').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { instantApply: e.target.checked } }); refresh(); };
$('insert').onchange = async (e) => { await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { insertEnabled: e.target.checked } }); refresh(); };
refresh();
