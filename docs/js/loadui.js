// Overload button + local label log UI for conversation.html. Browser only; labels stay in localStorage.
import { loadJSON, saveJSON, removeKey } from './storage.js?v=f2a7a765';
import { reportOverload, activeSignals, loadIndexFor, density, sessionMinutes, effective } from './partner.js?v=f2a7a765';
import { makeLabel, appendLabel, normalizeLabels, exportLabelsJSON, LABEL_KEY, newSessionId } from './labels.js?v=f2a7a765';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function readLabels() { return normalizeLabels(loadJSON(LABEL_KEY)?.labels); }
function writeLabels(labels) { saveJSON(LABEL_KEY, { v: 1, labels }); }

/**
 * @param {{ getSession:()=>object, setSession:(s)=>void, getProfile:()=>object, getCond:()=>object, tr:(k,p?)=>string, onChange:()=>void, getSessionId:()=>string }} api
 */
export function mountLoadButton(api) {
  const btn = $('ld-overload');
  const countEl = $('ld-count');
  const status = $('ld-status');
  const list = $('ld-list');
  if (!btn) return { refresh() {} };

  const refresh = () => {
    const labels = readLabels();
    if (countEl) countEl.textContent = api.tr('ld_count', { n: labels.length });
    if (list) {
      list.replaceChildren();
      for (const L of labels.slice(-8).reverse()) {
        const li = el('li', null, `${L.ts} · ${L.kind} · turns=${L.recentTurns} · load=${L.signals?.loadIndex ?? '—'}`);
        list.append(li);
      }
    }
  };

  btn.addEventListener('click', () => {
    const st0 = api.getSession();
    if (!st0) return;
    const r = reportOverload(st0);
    api.setSession(r.state);
    const dens = density(r.state);
    const load = loadIndexFor(r.state, api.getProfile(), api.getCond());
    const eff = effective(r.state);
    const label = makeLabel({
      sessionId: api.getSessionId(),
      recentTurns: st0.turns.filter((t) => !t.seed).length,
      source: 'web',
      kind: 'overloaded',
      signals: {
        loadIndex: load,
        densityLevel: dens.level,
        amount: eff.amount,
        speech: eff.speech,
        active: activeSignals(r.state),
        sessionMinutes: sessionMinutes(r.state),
        rule: r.decision?.rule ?? 'E3',
      },
    });
    writeLabels(appendLabel(readLabels(), label));
    if (status) status.textContent = api.tr('ld_recorded');
    refresh();
    api.onChange();
  });

  $('ld-export')?.addEventListener('click', () => {
    const json = exportLabelsJSON(readLabels());
    const blob = new Blob([json], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attune-labels-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (status) status.textContent = api.tr('ld_exported');
  });

  $('ld-clear')?.addEventListener('click', () => {
    removeKey(LABEL_KEY);
    if (status) status.textContent = api.tr('ld_cleared');
    refresh();
  });

  document.addEventListener('attune:lang', refresh);
  refresh();
  return { refresh };
}

export { newSessionId, LABEL_KEY };
