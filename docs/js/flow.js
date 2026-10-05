// Feedback-loop stage: scroll/cycle highlight on consolidated pills. No network.
export function mountFlow() {
  const root = document.getElementById('fb-flow');
  if (!root) return;
  const steps = [...root.querySelectorAll('[data-fb-step]')];
  if (!steps.length) return;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const setActive = (i) => {
    steps.forEach((el, n) => {
      el.classList.toggle('is-active', n === i);
      el.setAttribute('aria-current', n === i ? 'step' : 'false');
    });
    root.dataset.active = String(i);
  };
  setActive(0);
  if (reduced) return;
  let idx = 0;
  let timer = null;
  const section = document.getElementById('feedback-flow');
  const cycle = new IntersectionObserver((ents) => {
    const on = ents.some((e) => e.isIntersecting);
    clearInterval(timer); timer = null;
    if (!on) return;
    timer = setInterval(() => { idx = (idx + 1) % steps.length; setActive(idx); }, 2800);
  }, { threshold: 0.25 });
  if (section) cycle.observe(section);
}
