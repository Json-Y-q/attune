// Feedback-loop flow graphic: scroll-linked step highlight. No network.
export function mountFlow() {
  const root = document.getElementById('fb-flow');
  if (!root) return;
  const steps = [...root.querySelectorAll('[data-fb-step]')];
  if (!steps.length) return;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const setActive = (i) => {
    steps.forEach((el, n) => {
      const on = n === i;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-current', on ? 'step' : 'false');
    });
    root.dataset.active = String(i);
  };

  if (reduced) {
    setActive(0);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!visible.length) return;
    const i = Number(visible[0].target.dataset.fbStep);
    if (Number.isFinite(i)) setActive(i);
  }, { root: null, threshold: [0.35, 0.55, 0.7], rootMargin: '-18% 0px -35% 0px' });

  steps.forEach((el) => io.observe(el));
  setActive(0);

  // gentle auto-cycle while the whole section is in view (paused when reduced-motion)
  let timer = null;
  let idx = 0;
  const section = document.getElementById('feedback-flow');
  const cycle = new IntersectionObserver((ents) => {
    const on = ents.some((e) => e.isIntersecting);
    clearInterval(timer); timer = null;
    if (!on) return;
    timer = setInterval(() => {
      idx = (idx + 1) % steps.length;
      setActive(idx);
    }, 2600);
  }, { threshold: 0.25 });
  if (section) cycle.observe(section);
}
