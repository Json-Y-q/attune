// "From overload to recovery" player: draws the pure story timeline (story.js) as a phone mock-up,
// a load meter, the optional mascot and step buttons. Text via textContent only; no network, no storage except
// the mascot on/off choice.
import { storyAt, STORY_MS, PHASES, DEFAULT_LEVELS } from './story.js?v=8bf31d35';
import { transform } from './transform.js?v=8bf31d35';
import { renderBlocks, renderLoadMeter } from './ui.js?v=8bf31d35';
import { renderMascot, poseFor, STILL_POSES } from './mascot.js?v=8bf31d35';
import { PERSONAS, SHARED, allAt, adjustMinute, riseRate, minutesToMs } from './individuals.js?v=8bf31d35';
import { loadJSON, saveJSON } from './storage.js?v=8bf31d35';
import { prepareTyping, revealChars, typedChars } from './typing.js?v=8bf31d35';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function mountStory(getTr) {
  const tr = (k, p) => getTr()(k, p);
  const state = { t: 0, playing: false, raf: 0, last: 0, touched: false, viewKey: '', phase: '', poseKey: '', aiEl: null, lastN: -1, mascotOn: loadJSON('attune.mascot') !== false };

  function bubble(cls, nodeOrText) {
    const b = el('div', `st-bubble ${cls}`);
    if (typeof nodeOrText === 'string') b.textContent = nodeOrText; else b.append(nodeOrText);
    return b;
  }
  function card(title, lines, extra) {
    const c = el('div', 'st-card');
    c.append(el('strong', null, title));
    lines.forEach((l) => c.append(el('span', null, l)));
    if (extra) c.append(extra);
    return c;
  }
  function renderChat(s) {
    const chat = $('st-chat');
    chat.replaceChildren();
    if (s.ms >= 12000) chat.append(bubble('you', tr('st_you1')));
    const ai = el('div');
    renderBlocks(ai, transform(tr('sample_answer'), { amount: s.reply.amount, style: s.reply.style }).blocks, tr);
    prepareTyping(ai);
    state.aiEl = ai; state.lastN = -1;
    chat.append(bubble('ai', ai));
    if (s.ms >= 23500 && !s.showCheckpoint && !s.showResume) chat.append(bubble('partner', tr('pm_r1')));
    if (s.showCheckpoint) {
      chat.append(bubble('partner', tr(s.resting ? 'pm_r8' : 'pm_r7')));
      chat.append(card(tr('st_cp_h'), [tr('st_cp_1'), tr('st_cp_2'), tr('st_cp_3')]));
      if (s.resting) chat.append(el('div', 'st-rest', tr('st_resting')));
    }
    if (s.showResume) {
      chat.append(card(tr('st_rs_h'), [tr('st_rs_1')], el('span', 'st-fake-btn', tr('st_rs_2'))));
      chat.append(bubble('partner', tr('st_resume_msg')));
      if (s.ms >= 40000) chat.append(bubble('you', tr('st_you2')));
    }
  }
  function renderPhase(s) {
    $('st-phase-title').textContent = tr(`st_p_${s.phase}`);
    $('st-phase-desc').textContent = tr(`st_d_${s.phase}`);
    document.querySelectorAll('#st-steps button').forEach((b) => {
      if (b.dataset.phase === s.phase) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  function render() {
    const s = storyAt(state.t);
    renderLoadMeter($('st-meter'), s.load, tr);
    const badge = $('st-badge');
    badge.textContent = s.recovered ? tr('st_recovered') : tr(`dm_zone_${s.zone}`);
    badge.className = `st-badge z-${s.recovered ? 'calm' : s.zone}${s.recovered ? ' ok' : ''}`;
    $('st-levels').textContent = tr('st_levels', { a: s.amount, p: s.pace });
    $('st-defaults').textContent = tr('st_defaults', { a: DEFAULT_LEVELS.amount, p: DEFAULT_LEVELS.pace });
    $('st-min').textContent = tr('st_min', { m: s.virtualMinutes });
    $('st-scrub').value = String(Math.round(state.t));
    $('st-scrub').setAttribute('aria-valuetext', `${tr(`st_p_${s.phase}`)}, ${s.load} / 100`);
    const key = [s.phase, s.reply.at, s.reply.amount, s.reply.style, s.showCheckpoint, s.showResume, s.resting, s.ms >= 12000, s.ms >= 23500, s.ms >= 40000, tr('st_you1')].join('|');
    if (key !== state.viewKey) { state.viewKey = key; renderChat(s); }
    // typing: how much of the current reply is visible depends only on the time since it started (instant when motion is reduced)
    const n = reduced() ? Infinity : typedChars(s.ms - s.reply.at, s.reply.cps);
    if (state.aiEl && n !== state.lastN) { state.lastN = n; revealChars(state.aiEl, n); }
    if (s.phase + tr('st_h') !== state.phase) { state.phase = s.phase + tr('st_h'); renderPhase(s); }
    $('st-chip').hidden = !s.chip;
    $('st-chip').textContent = tr('st_chip');
    $('st-device-time').textContent = s.virtualMinutes ? `+${s.virtualMinutes}′` : '';
    const mBox = $('st-mascot');
    mBox.hidden = !state.mascotOn;
    if (state.mascotOn) {
      const pose = poseFor(s);
      renderMascot(mBox, reduced() ? { ...pose, breathing: false, shake: 0, air: 0 } : pose);
    }
    $('st-play').textContent = state.playing ? tr('st_pause') : tr(state.t >= STORY_MS ? 'st_replay' : 'st_play');
  }
  function tick(ts) {
    if (!state.playing) return;
    state.t = Math.min(STORY_MS, state.t + (ts - state.last));
    state.last = ts;
    render();
    if (state.t >= STORY_MS) { state.playing = false; render(); return; }
    state.raf = requestAnimationFrame(tick);
  }
  function play() {
    if (state.t >= STORY_MS) state.t = 0;
    state.playing = true;
    state.last = performance.now();
    state.raf = requestAnimationFrame(tick);
    render();
  }
  function pause() { state.playing = false; cancelAnimationFrame(state.raf); render(); }
  function seek(ms, userAction = true) { if (userAction) state.touched = true; pause(); state.t = Math.max(0, Math.min(STORY_MS, ms)); render(); }

  $('st-play').addEventListener('click', () => { state.touched = true; if (state.playing) pause(); else play(); });
  $('st-scrub').addEventListener('input', (e) => seek(Number(e.target.value)));
  document.querySelectorAll('#st-steps button').forEach((b) => b.addEventListener('click', () => seek(PHASES.find((p) => p.id === b.dataset.phase).at + 700)));
  $('st-mascot-toggle').checked = state.mascotOn;
  $('st-mascot-toggle').addEventListener('change', (e) => { state.mascotOn = e.target.checked; saveJSON('attune.mascot', state.mascotOn); state.poseKey = ''; render(); document.dispatchEvent(new CustomEvent('attune:mascot', { detail: { on: state.mascotOn } })); });
  document.addEventListener('attune:mascot', (e) => { if (e.detail.on !== state.mascotOn) { state.mascotOn = e.detail.on; $('st-mascot-toggle').checked = state.mascotOn; state.poseKey = ''; render(); } });
  document.addEventListener('attune:story-seek', (e) => seek(e.detail?.t ?? 0, false)); // deterministic seek (used to record the video)
  if ('IntersectionObserver' in globalThis && !reduced()) {
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !state.touched && !state.playing && state.t === 0) play();
    }, { threshold: 0.55 }).observe($('st-device'));
  }
  // still frames strip
  document.querySelectorAll('[data-still]').forEach((box) => renderMascot(box, STILL_POSES[box.dataset.still]));
  return { render: () => { state.viewKey = ''; state.phase = ''; state.poseKey = ''; render(); } };
}

/** "Same conversation, different pace": four illustrative mascots, one shared conversation (individuals.js). */
export function mountIndividuals(getTr) {
  const tr = (k, p) => getTr()(k, p);
  const st = { t: 0, playing: false, raf: 0, last: 0, touched: false, on: loadJSON('attune.mascot') !== false, poseKeys: {} };
  const grid = $('in-grid');
  const rows = {};
  const desc = (id) => tr(`in_desc_${id}`); // neutral description for assistive tech only (aria-label); nothing like it is shown on screen
  const mini = (id, pose = {}) => { const b = el('span', 'in-mini'); b.setAttribute('aria-hidden', 'true'); renderMascot(b, { zone: 'calm', face: 'calm', puff: 1, sweat: 0, breathing: false, variant: id, ...pose }); return b; };

  function build() {
    grid.replaceChildren();
    $('in-tl').replaceChildren();
    for (const p of PERSONAS) {
      const card = el('article', 'in-card glass');
      card.dataset.id = p.id;
      card.setAttribute('aria-label', desc(p.id));
      const mascot = el('div', 'in-mascot'); mascot.setAttribute('aria-hidden', 'true');
      const tag = el('p', 'in-tag', tr(`in_t_${p.id}`));
      const more = el('details', 'in-more');
      more.append(el('summary', null, tr('in_more')), el('p', 'muted in-line', tr('in_base', { l: p.limitMin, p: p.adjustAt })), el('p', 'muted in-line', tr('in_rate', { r: riseRate(p) })));
      const meter = el('div', 'meter');
      const badge = el('span', 'st-badge');
      const state = el('p', 'in-line in-state');
      card.append(mascot, tag, meter, el('p', 'in-badge-row'), state, more);
      card.children[3].append(badge);
      grid.append(card);
      rows[p.id] = { card, mascot, meter, badge, state };
      // timeline row
      const row = el('div', 'in-row');
      row.append(mini(p.variant));
      const track = el('div', 'in-track'); track.setAttribute('aria-hidden', 'true');
      const mark = el('i', 'in-mark'); mark.style.left = `${(minutesToMs(adjustMinute(p)) / SHARED.durationMs) * 100}%`;
      const head = el('i', 'in-head');
      track.append(mark, head);
      row.append(track, el('span', 'in-row-m', `${adjustMinute(p)}′`));
      $('in-tl').append(row);
      rows[p.id].head = head;
    }
    const first = $('in-first');
    first.replaceChildren(el('span', null, tr('in_order')));
    for (const id of allAt(0).order) first.append(mini(PERSONAS.find((x) => x.id === id).variant));
    first.setAttribute('aria-label', `${tr('in_order')}: ${allAt(0).order.map(desc).join(', ')}`);
    $('in-p').textContent = tr('in_p', { t: SHARED.minutes, n: SHARED.turns });
  }
  function render() {
    const s = allAt(st.t);
    for (const r of s.list) {
      const row = rows[r.id];
      renderLoadMeter(row.meter, r.load, tr);
      row.badge.textContent = tr(`dm_zone_${r.zone}`);
      row.badge.className = `st-badge z-${r.zone}`;
      row.state.textContent = r.adjusted ? tr('in_state_adj', { m: Math.round(r.adjustedAtMin) }) : tr('in_state_wait');
      row.card.classList.toggle('adjusted', r.adjusted);
      row.head.style.left = `${(st.t / SHARED.durationMs) * 100}%`;
      const pose = { ...r.pose, plain: !st.on, variant: st.on ? r.pose.variant : null, breathing: r.pose.breathing && !reduced(), ...(reduced() ? { shake: 0, air: 0 } : {}) };
      renderMascot(row.mascot, pose);
    }
    $('in-min').textContent = tr('in_min', { m: Math.round(s.minute), t: SHARED.minutes });
    $('in-scrub').value = String(Math.round(st.t));
    $('in-scrub').setAttribute('aria-valuetext', tr('in_min', { m: Math.round(s.minute), t: SHARED.minutes }));
    $('in-play').textContent = st.playing ? tr('in_pause') : tr(st.t >= SHARED.durationMs ? 'in_replay' : 'in_play');
  }
  function tick(ts) {
    if (!st.playing) return;
    st.t = Math.min(SHARED.durationMs, st.t + (ts - st.last));
    st.last = ts;
    render();
    if (st.t >= SHARED.durationMs) { st.playing = false; render(); return; }
    st.raf = requestAnimationFrame(tick);
  }
  const play = () => { if (st.t >= SHARED.durationMs) st.t = 0; st.playing = true; st.last = performance.now(); st.raf = requestAnimationFrame(tick); render(); };
  const pause = () => { st.playing = false; cancelAnimationFrame(st.raf); render(); };
  const seek = (ms, user = true) => { if (user) st.touched = true; pause(); st.t = Math.max(0, Math.min(SHARED.durationMs, ms)); render(); };

  $('in-play').addEventListener('click', () => { st.touched = true; if (st.playing) pause(); else play(); });
  $('in-scrub').addEventListener('input', (e) => seek(Number(e.target.value)));
  $('in-mascot-toggle').checked = st.on;
  $('in-mascot-toggle').addEventListener('change', (e) => { st.on = e.target.checked; saveJSON('attune.mascot', st.on); st.poseKeys = {}; render(); document.dispatchEvent(new CustomEvent('attune:mascot', { detail: { on: st.on } })); });
  document.addEventListener('attune:mascot', (e) => { if (e.detail.on !== st.on) { st.on = e.detail.on; $('in-mascot-toggle').checked = st.on; st.poseKeys = {}; render(); } });
  document.addEventListener('attune:individuals-seek', (e) => seek(e.detail?.t ?? 0, false));
  build();
  // reduced motion: no autoplay, start on the last frame so the differences are visible without motion
  if (reduced()) st.t = SHARED.durationMs;
  render();
  if ('IntersectionObserver' in globalThis && !reduced()) {
    new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !st.touched && !st.playing && st.t === 0) play(); }, { threshold: 0.4 }).observe(grid);
  }
  return { render: () => { build(); st.poseKeys = {}; render(); } };
}
