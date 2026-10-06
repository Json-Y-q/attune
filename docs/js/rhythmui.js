// "Work rhythm" view + automatic-suggestion settings. Reads local labels only; facts, not a diagnosis.
import { loadJSON, saveJSON, removeKey } from './storage.js?v=e86ad124';
import { aggregateRhythm, MIN_EVENTS, BANDS, BAND_HOURS } from './rhythm.js?v=e86ad124';
import { exportLabelsJSON, LABEL_KEY } from './labels.js?v=e86ad124';
import { readLabels } from './loadui.js?v=e86ad124';
import { SUGGEST_KEY, normalizeSuggest, canSuggest, setEnabled, setDailyMax, resetSuggest, DAILY_MAX_CHOICES } from './suggest.js?v=e86ad124';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export const readSuggest = () => normalizeSuggest(loadJSON(SUGGEST_KEY));
export const writeSuggest = (st) => { saveJSON(SUGGEST_KEY, st); document.dispatchEvent(new CustomEvent('attune:suggest')); };

/** @param {{ tr:(k:string,p?:object)=>any, lang:()=>string }} api */
export function mountRhythm(api) {
  const root = $('rhythm');
  if (!root) return { refresh() {} };
  const tr = api.tr;
  const bandLabel = (b) => tr('rh_band', { a: b * BAND_HOURS, b: (b + 1) * BAND_HOURS });

  function renderSettings() {
    const st = readSuggest();
    $('sg-enabled').checked = st.enabled;
    const sel = $('sg-max');
    if (!sel.options.length) DAILY_MAX_CHOICES.forEach((n) => { const o = el('option', null, String(n)); o.value = String(n); sel.append(o); });
    sel.value = String(st.dailyMax);
    sel.disabled = !st.enabled;
    const g = canSuggest(st, Date.now());
    const line = g.reason === 'off' ? tr('sg_st_off')
      : g.reason === 'backoff' ? tr('sg_st_backoff', { d: new Date(g.until).toLocaleString(api.lang(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
        : g.reason === 'cap' ? tr('sg_st_cap') : tr('sg_st_ok', { n: g.remaining });
    $('sg-status').textContent = line;
  }

  function renderView() {
    const labels = readLabels();
    const agg = aggregateRhythm(labels);
    $('rh-total').textContent = tr('rh_total', { n: labels.length });
    const sparse = $('rh-sparse');
    const body = $('rh-body');
    sparse.hidden = agg.enough;
    sparse.textContent = tr('rh_sparse', { n: agg.events, m: MIN_EVENTS });
    body.hidden = !agg.enough;
    renderAccept(agg);
    if (!agg.enough) return;
    const days = tr('rh_days');
    // heatmap: 7 weekdays × 8 time bands
    const heat = $('rh-heat');
    heat.replaceChildren();
    heat.style.setProperty('--cols', String(BANDS));
    heat.append(el('span', 'rh-corner'));
    for (let b = 0; b < BANDS; b++) heat.append(el('span', 'rh-colh', String(b * BAND_HOURS)));
    for (let d = 0; d < 7; d++) {
      heat.append(el('span', 'rh-rowh', days[d]));
      for (let b = 0; b < BANDS; b++) {
        const n = agg.heat[d][b];
        const c = el('span', 'rh-cell');
        c.style.setProperty('--a', agg.heatMax ? (n / agg.heatMax).toFixed(2) : '0');
        c.dataset.n = String(n);
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', tr('rh_cell', { d: days[d], b: bandLabel(b), n }));
        c.title = tr('rh_cell', { d: days[d], b: bandLabel(b), n });
        heat.append(c);
      }
    }
    $('rh-fact-peak').textContent = agg.peak ? tr('rh_fact_peak', { d: days[agg.peak.dow], b: bandLabel(agg.peak.band) }) : '';
    // session-minute bars
    const bins = tr('rh_bins');
    const bars = $('rh-session');
    bars.replaceChildren();
    const max = Math.max(1, ...agg.session);
    agg.session.forEach((n, i) => {
      const li = el('li', i === agg.sessionPeak ? 'peak' : null);
      const bar = el('span', 'rh-bar');
      bar.style.setProperty('--h', `${Math.round((n / max) * 100)}%`);
      li.append(bar, el('span', 'rh-bar-n', String(n)), el('span', 'rh-bar-l', bins[i]));
      li.setAttribute('aria-label', `${bins[i]}: ${n}`);
      bars.append(li);
    });
    $('rh-fact-session').textContent = agg.sessionPeak != null ? tr('rh_fact_session', { b: bins[agg.sessionPeak], m: agg.medianMin }) : '';
  }

  function renderAccept(agg) {
    const s = agg.suggest;
    const box = $('rh-accept');
    box.replaceChildren();
    if (!s.shown) { box.append(el('p', 'muted', tr('rh_fact_accept_none'))); return; }
    const pct = Math.round((s.rate ?? 0) * 100);
    const meter = el('div', 'rh-rate');
    const fill = el('span', 'rh-rate-fill');
    fill.style.width = `${pct}%`;
    meter.append(fill);
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', `${pct}%`);
    box.append(meter, el('p', null, tr('rh_fact_accept', { a: s.accept, n: s.shown, p: pct, r: s.reject, i: s.ignore })));
  }

  function refresh() { renderSettings(); renderView(); }

  $('sg-enabled').addEventListener('change', (e) => { writeSuggest(setEnabled(readSuggest(), e.target.checked)); refresh(); });
  $('sg-max').addEventListener('change', (e) => { writeSuggest(setDailyMax(readSuggest(), Number(e.target.value))); refresh(); });
  $('sg-reset').addEventListener('click', () => { writeSuggest(resetSuggest(readSuggest())); $('rh-status').textContent = tr('sg_set_reset_done'); refresh(); });
  $('rh-export').addEventListener('click', () => {
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([exportLabelsJSON(readLabels())], { type: 'application/json' }));
    a.download = `attune-labels-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('rh-clear').addEventListener('click', () => {
    removeKey(LABEL_KEY);
    document.dispatchEvent(new CustomEvent('attune:labels'));
    $('rh-status').textContent = tr('rh_cleared');
  });
  document.addEventListener('attune:labels', refresh);
  document.addEventListener('attune:suggest', renderSettings);
  document.addEventListener('attune:lang', refresh);
  refresh();
  return { refresh };
}
