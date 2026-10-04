// Optional media slots (photos / illustrations / hero loop video).
// Each slot is <figure data-media-slot data-media-ready="false"> holding an inline SVG placeholder (.ob-ph)
// and a <template data-media-template> with the real <picture>/<video>. The template is inert, so no file is
// requested until you set data-media-ready="true" (see docs/media/README.md). No network code here.
import { applyI18n, t } from './i18n.js?v=03a17e33';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mountVideo(slot, video, lang) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn secondary ob-media-btn';
  let userPaused = false;
  const label = () => { btn.textContent = t(slot.dataset.lang || lang, video.paused ? 'md_play' : 'md_pause'); };
  btn.addEventListener('click', () => {
    if (video.paused) { userPaused = false; video.play().catch(() => {}); } else { userPaused = true; video.pause(); }
  });
  video.addEventListener('play', label);
  video.addEventListener('pause', label);
  slot.append(btn);
  label();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !userPaused && !reduceMotion()) {
          video.preload = 'metadata'; // lazy: nothing is fetched until the slot scrolls into view
          video.play().catch(() => {});
        } else if (!e.isIntersecting) video.pause();
      }
    }).observe(slot);
  }
}

/** Mount ready slots once; on every call re-apply translations and caption language. */
export function mountMedia(lang) {
  document.querySelectorAll('[data-media-slot]').forEach((slot) => {
    if (slot.dataset.mediaReady === 'true' && !slot.dataset.mounted) {
      const tpl = slot.querySelector('template[data-media-template]');
      if (!tpl) return;
      const node = tpl.content.cloneNode(true);
      const video = node.querySelector('video');
      const img = node.querySelector('img');
      const ph = slot.querySelector('.ob-ph');
      // Keep the SVG placeholder until the real asset has loaded; if it fails, the placeholder stays.
      const reveal = () => { if (ph) ph.hidden = true; };
      if (img) img.addEventListener('load', reveal, { once: true });
      if (video) { video.addEventListener('loadeddata', reveal, { once: true }); video.autoplay = false; }
      slot.prepend(node);
      slot.dataset.mounted = 'true';
      if (video) mountVideo(slot, slot.querySelector('video'), lang);
    }
    slot.dataset.lang = lang;
    applyI18n(slot, lang);
    slot.querySelectorAll('video').forEach((v) => {
      for (const tr of v.textTracks) tr.mode = tr.language === lang ? 'showing' : 'disabled';
      v.dispatchEvent(new Event('pause')); // refresh the button label
    });
  });
}
