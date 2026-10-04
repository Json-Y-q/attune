// Tiny inline-SVG charts for the profile result (no libraries, text via textContent / attributes only).
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, text) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Radar chart. axes: [{label, value 0-100 | null}] (first axis points up, clockwise). */
export function renderRadar(box, axes, altText) {
  box.replaceChildren();
  const size = 280;
  const c = size / 2;
  const R = 86;
  const n = axes.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poly = (r) => axes.map((_, i) => pt(i, r).map((x) => x.toFixed(1)).join(',')).join(' ');
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': altText, class: 'rd' });
  [0.25, 0.5, 0.75, 1].forEach((f) => svg.append(svgEl('polygon', { points: poly(R * f), class: 'rd-ring' })));
  axes.forEach((_, i) => { const [x, y] = pt(i, R); svg.append(svgEl('line', { x1: c, y1: c, x2: x.toFixed(1), y2: y.toFixed(1), class: 'rd-axis' })); });
  const dataPts = axes.map((a, i) => pt(i, R * clamp01((a.value ?? 0) / 100)).map((x) => x.toFixed(1)).join(','));
  svg.append(svgEl('polygon', { points: dataPts.join(' '), class: 'rd-area' }));
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R * clamp01((a.value ?? 0) / 100));
    svg.append(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4.5, class: 'rd-dot' }));
    const [lx, ly] = pt(i, R + 22);
    const anchor = Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end';
    svg.append(svgEl('text', { x: lx.toFixed(1), y: (ly + 4).toFixed(1), 'text-anchor': anchor, class: 'rd-label' }, `${a.label} ${a.value == null ? '–' : Math.round(a.value)}`));
  });
  box.append(svg);
}

/** Half-circle gauge for a 0-100 value. */
export function renderGauge(box, value, label, altText) {
  box.replaceChildren();
  const v = clamp01(value / 100) * 100;
  const svg = svgEl('svg', { viewBox: '0 0 220 138', role: 'img', 'aria-label': altText, class: 'gg' });
  const d = 'M 20 112 A 90 90 0 0 1 200 112';
  svg.append(svgEl('path', { d, class: 'gg-track', pathLength: 100 }));
  svg.append(svgEl('path', { d, class: 'gg-value', pathLength: 100, 'stroke-dasharray': `${v} 100` }));
  svg.append(svgEl('text', { x: 110, y: 100, 'text-anchor': 'middle', class: 'gg-num' }, String(Math.round(value))));
  svg.append(svgEl('text', { x: 110, y: 130, 'text-anchor': 'middle', class: 'gg-label' }, label));
  box.append(svg);
}
