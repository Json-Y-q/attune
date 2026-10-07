// "Style card": the profile written as a short natural-language instruction an AI can read directly.
// Pure function (no DOM, no network). Text comes from the i18n dictionary (sc_* keys).
import { t } from './i18n.js?v=8bf31d35';

export function styleCard(profile, lang = 'en') {
  const { amount, pace, style } = profile.levels;
  return [
    t(lang, 'sc_head'),
    `- ${t(lang, 'sc_amount')[amount - 1]}`,
    `- ${t(lang, 'sc_pace')[pace - 1]}`,
    `- ${t(lang, `sc_style_${style}`)}`,
    `- ${t(lang, 'sc_tired')}`,
    t(lang, 'sc_foot'),
  ].join('\n');
}
