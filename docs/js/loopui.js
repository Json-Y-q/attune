// Loop escape UI (conversation.html). Everything stays in this tab: the pasted text is read from the text box, analysed by loop.js
// (rules only, no network, no storage) and drawn with textContent. Nothing is saved, so a reload or "Clear" removes it.
import { analyzeLoop, parseConversation, escapeOptions, optionContent, MAX_TURNS, EXAMPLES } from './loop.js?v=395c86ef';
import { offerLoopEscape, respondToSuggestion, detectText } from './partner.js?v=395c86ef';
import { t } from './i18n.js?v=395c86ef';
import { getLang } from './storage.js?v=395c86ef';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const LOADS = { calm: 25, mid: 60, high: 85 };

/**
 * @param {{ getSession:()=>object, setSession:(s:object, persistOff?:string[])=>void, getLoad:()=>number }} ctx the conversation simulator's session (partner.js state)
 */
export function mountLoop(ctx) {
  const tr = (k, p) => t(getLang(), k, p);
  const ls = { turns: [], analysis: null, offer: null, phase: 'none', picked: null, own: null, note: null, truncated: false };

  const loadValue = () => { const v = $('lo-load').value; return v === 'sim' ? ctx.getLoad() : LOADS[v]; };
  function renderLoadSelect() {
    const o = $('lo-load').querySelector('option[value="sim"]');
    o.textContent = tr('lo_load_sim', { v: Math.round(ctx.getLoad()) });
  }

  function analyze() {
    const turns = parseConversation($('lo-input').value);
    if (!turns.length) { Object.assign(ls, { turns: [], analysis: null, offer: null, phase: 'empty', picked: null, note: null }); render(); return; }
    if (turns.some((x) => x.role === 'user' && detectText(x.text).crisis)) { // R14 comes first: no loop analysis, hand off
      Object.assign(ls, { turns: [], analysis: null, offer: null, phase: 'handoff', picked: null, note: null });
      render();
      return;
    }
    ls.truncated = $('lo-input').value.length > 0 && turns.length >= MAX_TURNS;
    ls.turns = turns;
    ls.analysis = analyzeLoop(turns);
    const s0 = structuredClone(ctx.getSession());
    if (s0.pending === 'loop') s0.pending = null; // a new check replaces my own unanswered offer
    ls.offer = offerLoopEscape(s0, ls.analysis, { loadIndex: loadValue() });
    if (ls.offer.offered) ctx.setSession(ls.offer.state);
    ls.phase = ls.offer.offered ? 'offer' : 'result';
    ls.picked = null; ls.own = null; ls.note = null;
    render();
  }
  function respond(answer) {
    const r = respondToSuggestion(ctx.getSession(), 'loop', answer);
    ctx.setSession(r.state, r.persistOff ?? undefined);
    if (answer === 'accept') { ls.phase = 'options'; ls.picked = null; } else { ls.phase = 'dismissed'; }
    render();
    $('lo-result').focus();
  }
  function undo() {
    const r = respondToSuggestion(ctx.getSession(), 'loop', 'reject');
    ctx.setSession(r.state);
    ls.phase = 'undone'; ls.picked = null; ls.own = null;
    render();
    $('lo-result').focus();
  }

  const reasonsText = () => (ls.offer?.priority ? [tr('sig_L1'), tr('sig_L2')] : [tr('sig_L1')]).join(' + ');

  function renderEvidence(box) {
    const a = ls.analysis;
    box.append(el('h4', null, tr('lo_ev_h')));
    const ul = el('ul', 'lo-ev');
    a.evidence.forEach((e) => ul.append(el('li', null, tr(e.key, e.params))));
    box.append(ul);
  }
  function copyButton(getText) {
    const row = el('div', 'row');
    const b = el('button', 'btn secondary', tr('lo_copy'));
    b.type = 'button';
    const status = el('span', 'status');
    status.setAttribute('role', 'status');
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(getText()); status.textContent = tr('lo_copied'); } catch { status.textContent = tr('lo_copy_fail'); }
    });
    row.append(b, status);
    return row;
  }
  function renderPicked(box) {
    const id = ls.picked;
    const c = optionContent(id, ls.analysis, ls.turns, getLang());
    const card = el('div', 'st-card lo-out');
    card.append(el('h4', null, tr({ restate: 'lo_out_restate_h', checkpoint: 'lo_out_checkpoint_h', approach: 'lo_out_approach_h', prompt: 'lo_out_prompt_h', own: 'lo_out_own_h' }[id])));
    if (id === 'restate') card.append(el('p', 'lo-quote', c.text || tr('lo_none_listed')));
    if (id === 'approach') card.append(el('p', null, c.text));
    if (id === 'checkpoint') {
      [['lo_tried_h', c.tried], ['lo_failed_h', c.failed]].forEach(([k, items]) => {
        card.append(el('strong', null, tr(k)));
        if (items.length) { const ul = el('ul'); items.forEach((x) => ul.append(el('li', null, x))); card.append(ul); } else card.append(el('p', 'muted', tr('lo_none_listed')));
      });
      card.append(el('strong', null, tr('lo_open_h')), el('p', 'lo-quote', c.open || tr('lo_none_listed')));
    }
    if (id === 'prompt') {
      const ta = el('textarea', 'lo-prompt');
      ta.readOnly = true; ta.rows = 9; ta.value = c.text;
      ta.setAttribute('aria-label', tr('lo_out_prompt_h'));
      card.append(ta, copyButton(() => ta.value), el('p', 'muted lp-help', tr('lo_out_prompt_note')));
    }
    if (id === 'own') {
      const g = el('div', 'lo-own'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', tr('lo_out_own_h'));
      c.choices.forEach((ch) => {
        const b = el('button', 'btn secondary', ch.text); b.type = 'button';
        b.setAttribute('aria-pressed', String(ls.own === ch.id));
        b.addEventListener('click', () => { ls.own = ch.id; render(); });
        g.append(b);
      });
      card.append(g);
    }
    const undoRow = el('div', 'row');
    const ub = el('button', 'btn secondary', tr('lo_undo')); ub.type = 'button'; ub.addEventListener('click', undo);
    undoRow.append(ub);
    card.append(undoRow);
    box.append(card);
  }
  function renderOptions(box) {
    box.append(el('h4', null, tr('lo_opts_h')));
    const order = escapeOptions(ls.analysis);
    const g = el('div', 'lo-opts'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', tr('lo_opts_h'));
    order.forEach((id, i) => {
      const b = el('button', 'btn secondary', tr(`lo_s_${id}`)); b.type = 'button';
      if (i === 0) b.append(el('small', 'lo-first', ` · ${tr('lo_first')}`));
      b.setAttribute('aria-pressed', String(ls.picked === id));
      b.addEventListener('click', () => { ls.picked = id; ls.own = null; render(); });
      g.append(b);
    });
    box.append(g);
    if (ls.picked) renderPicked(box);
  }

  function render() {
    renderLoadSelect();
    const box = $('lo-result');
    box.replaceChildren();
    box.hidden = ls.phase === 'none';
    if (ls.phase === 'none') return;
    if (ls.phase === 'handoff') { box.append(el('p', null, tr('pm_r14'))); return; }
    if (ls.phase === 'empty') { box.append(el('p', null, tr('lo_no_text'))); return; }
    const a = ls.analysis;
    box.append(el('h3', null, tr('lo_res_h')));
    if (ls.truncated) box.append(el('p', 'muted lp-help', tr('lo_trunc', { n: MAX_TURNS })));
    if (a.tooFew) { box.append(el('p', null, tr('lo_toofew'))); return; }
    if (a.resolved) { box.append(el('p', null, tr('lo_resolved'))); return; }
    if (!a.type) { box.append(el('p', null, tr('lo_none')), el('p', 'muted lp-help', tr('lo_tone'))); return; }

    box.append(el('p', 'lo-type', tr(`lo_t_${a.type}`)));
    const bar = el('div', 'lo-bar'); bar.setAttribute('aria-hidden', 'true');
    const fill = el('span'); fill.style.width = `${Math.round(a.confidence * 100)}%`; bar.append(fill);
    box.append(bar, el('p', 'status', tr('lo_conf', { p: Math.round(a.confidence * 100) })));
    renderEvidence(box);
    if (ls.offer?.priority && ls.offer.offered) box.append(el('p', 'lo-prio', tr('lo_load_prio')));

    if (ls.phase === 'offer') {
      const card = el('div', 'st-card lo-offer');
      card.append(el('p', null, tr(ls.offer.state.lastDecision.messageKey)));
      const row = el('div', 'row');
      [['accept', 'lo_accept', 'btn'], ['reject', 'lo_notnow', 'btn secondary'], ['never', 'lo_never', 'btn secondary']].forEach(([ans, key, cls]) => {
        const b = el('button', cls, tr(key)); b.type = 'button'; b.addEventListener('click', () => respond(ans)); row.append(b);
      });
      card.append(row);
      const det = el('details', 'lp-orig');
      det.append(el('summary', null, tr('lo_why')), el('p', null, tr('lo_why_text', { r: reasonsText() })));
      card.append(det, el('p', 'muted lp-help', tr('lo_tone')));
      box.append(card);
    } else if (ls.phase === 'result') {
      const why = { cooldown: 'lo_blocked_cooldown', pending: 'lo_blocked_pending', off: 'lo_blocked_off', weak: 'lo_blocked_weak' }[ls.offer?.blockedBy];
      if (why) box.append(el('p', 'muted', tr(why)));
      const b = el('button', 'btn secondary', tr('lo_manual')); b.type = 'button';
      b.addEventListener('click', () => { ls.phase = 'options'; ls.picked = null; render(); });
      box.append(b);
    } else if (ls.phase === 'dismissed') {
      box.append(el('p', null, tr('lo_dismissed')));
    } else if (ls.phase === 'undone') {
      box.append(el('p', null, tr('lo_undone')));
    } else if (ls.phase === 'options') {
      renderOptions(box);
    }
  }

  document.querySelectorAll('.lo-exbtn').forEach((b) => b.addEventListener('click', () => {
    if (!EXAMPLES.includes(b.dataset.ex)) return;
    $('lo-input').value = tr(`lo_ex_${b.dataset.ex}_text`);
    analyze();
  }));
  $('lo-run').addEventListener('click', analyze);
  $('lo-clear').addEventListener('click', () => { $('lo-input').value = ''; Object.assign(ls, { turns: [], analysis: null, offer: null, phase: 'none', picked: null, own: null }); render(); });
  $('lo-load').addEventListener('change', () => renderLoadSelect());
  document.addEventListener('attune:lang', () => render());
  render();
  return { render, analyze };
}
