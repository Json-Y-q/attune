const $ = (id) => document.getElementById(id);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'get_status' });
  $('status').textContent = `Labels: ${s.count}\nInsert: ${s.prefs.insertEnabled !== false}\nConfirm: ${s.prefs.confirmBeforeInsert !== false}`;
  $('insert').checked = s.prefs.insertEnabled !== false;
  $('confirm').checked = s.prefs.confirmBeforeInsert !== false;
}
$('btn').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'record_overload', recentTurns: 0, signals: { from: 'popup' } });
  refresh();
};
$('export').onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: 'export_labels' });
  const blob = new Blob([r.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `attune-ext-labels-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
};
$('clear').onclick = async () => { await chrome.runtime.sendMessage({ type: 'clear_labels' }); refresh(); };
$('insert').onchange = async (e) => {
  await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { insertEnabled: e.target.checked } });
  refresh();
};
$('confirm').onchange = async (e) => {
  await chrome.runtime.sendMessage({ type: 'set_prefs', prefs: { confirmBeforeInsert: e.target.checked } });
  refresh();
};
refresh();
