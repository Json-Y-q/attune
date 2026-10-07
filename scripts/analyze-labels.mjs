#!/usr/bin/env node
// Summarise exported Attune label JSON (site "Export JSON" or extension export) into a Markdown report.
// Facts only (counts, times, rates). No diagnosis. Local files only; no network.
// Usage: node scripts/analyze-labels.mjs export1.json [export2.json ...] [--out report.md] [--lang ko]
import { readFileSync, writeFileSync } from 'node:fs';
import { aggregateRhythm, BANDS, BAND_HOURS, SESSION_BINS, MIN_EVENTS, isLoadEvent } from '../docs/js/rhythm.js';
import { normalizeLabels } from '../docs/js/labels.js';

const T = {
  en: {
    title: 'Attune label summary', files: 'Files', period: 'Period', days: (n) => `${n} days with records`, cols: '| date | records | load presses | suggestion answers |', total: 'Records',
    byLevel: 'Manual mascot presses by level', bySource: 'By source', heat: 'Load presses by weekday × time of day (local time at capture)',
    session: 'Load presses by minute into a session', accept: 'Automatic suggestions', rate: 'accepted', none: 'none yet',
    sparse: `Fewer than ${MIN_EVENTS} load presses: patterns are not shown yet. Keep recording.`,
    peak: 'Most load presses', median: 'Median session minute of a load press', daily: 'Records per day',
    note: 'Facts from your own labels only. Not a diagnosis; thresholds and bins are prototype assumptions.',
    days7: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], h: 'h', min: 'min', shown: 'shown', reject: 'passed', ignore: 'no answer',
  },
  ko: {
    title: 'Attune 라벨 요약', files: '파일', period: '기간', days: (n) => `기록 있는 날 ${n}일`, cols: '| 날짜 | 기록 | 부하 입력 | 제안 응답 |', total: '기록 수',
    byLevel: '마스코트 수동 입력(단계별)', bySource: '출처별', heat: '요일 × 시간대별 부하 입력 (기록 당시 현지 시각)',
    session: '세션 시작 후 몇 분째에 부하 입력', accept: '자동 제안', rate: '수락', none: '아직 없음',
    sparse: `부하 입력이 ${MIN_EVENTS}개 미만이라 아직 패턴을 보여 주지 않아요. 계속 기록해 주세요.`,
    peak: '부하 입력이 가장 많았던 때', median: '부하 입력의 세션 경과 분 중앙값', daily: '날짜별 기록 수',
    note: '내 라벨에서 나온 사실만 적었습니다. 진단이 아니며 구간·기준은 프로토타입 가정입니다.',
    days7: ['일', '월', '화', '수', '목', '금', '토'], h: '시', min: '분', shown: '표시', reject: '넘김', ignore: '응답 없음',
  },
};

export function readExport(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return normalizeLabels(Array.isArray(data) ? data : data?.labels);
}

const pct = (x) => `${Math.round(x * 100)}%`;
const count = (list, f) => list.reduce((m, l) => { const k = f(l); m[k] = (m[k] || 0) + 1; return m; }, {});

/** Build the Markdown report. */
export function summarize(labels, { lang = 'en', files = [] } = {}) {
  const t = T[lang] || T.en;
  const L = [...labels].sort((a, b) => a.ts.localeCompare(b.ts));
  const agg = aggregateRhythm(L);
  const out = [`# ${t.title}`, '', `> ${t.note}`, ''];
  const dayOf = (l) => { const d = new Date(l.ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // local date
  const perDay = count(L, dayOf);
  out.push('| | |', '|---|---|');
  if (files.length) out.push(`| ${t.files} | ${files.join(', ')} |`);
  out.push(`| ${t.total} | ${L.length} |`);
  if (L.length) out.push(`| ${t.period} | ${dayOf(L[0])} → ${dayOf(L.at(-1))} (${t.days(Object.keys(perDay).length)}) |`);
  const manual = L.filter((l) => l.kind !== 'suggest' && l.origin !== 'auto');
  const lv = count(manual, (l) => l.level || 'overloaded');
  out.push(`| ${t.byLevel} | calm ${lv.calm || 0} · rising ${lv.rising || 0} · overloaded ${lv.overloaded || 0} |`);
  const src = count(L, (l) => l.source || '?');
  out.push(`| ${t.bySource} | ${Object.entries(src).map(([k, v]) => `${k} ${v}`).join(' · ') || '–'} |`);
  const s = agg.suggest;
  out.push(`| ${t.accept} | ${s.shown ? `${t.shown} ${s.shown} · ${t.rate} ${s.accept} (${pct(s.rate)}) · ${t.reject} ${s.reject} · ${t.ignore} ${s.ignore}` : t.none} |`);
  if (agg.enough && agg.peak) out.push(`| ${t.peak} | ${t.days7[agg.peak.dow]} ${agg.peak.band * BAND_HOURS}–${(agg.peak.band + 1) * BAND_HOURS}${t.h} |`);
  if (agg.enough && agg.medianMin != null) out.push(`| ${t.median} | ${agg.medianMin}${t.min} |`);
  out.push('');
  if (!agg.enough) { out.push(t.sparse, ''); } else {
    out.push(`## ${t.heat}`, '');
    out.push(`| | ${Array.from({ length: BANDS }, (_, b) => `${b * BAND_HOURS}–${(b + 1) * BAND_HOURS}`).join(' | ')} |`);
    out.push(`|---|${'---|'.repeat(BANDS)}`);
    agg.heat.forEach((row, d) => out.push(`| ${t.days7[d]} | ${row.join(' | ')} |`));
    out.push('', `## ${t.session}`, '');
    const labelsBins = SESSION_BINS.map((lo, i) => (i === SESSION_BINS.length - 1 ? `${lo}+` : `${lo}–${SESSION_BINS[i + 1]}`));
    out.push(`| ${labelsBins.join(' | ')} |`, `|${'---|'.repeat(labelsBins.length)}`, `| ${agg.session.join(' | ')} |`, '');
  }
  out.push(`## ${t.daily}`, '', t.cols, '|---|---|---|---|');
  for (const day of Object.keys(perDay)) {
    const dayL = L.filter((l) => dayOf(l) === day);
    out.push(`| ${day} | ${dayL.length} | ${dayL.filter(isLoadEvent).length} | ${dayL.filter((l) => l.origin === 'auto' && l.outcome).length} |`);
  }
  return `${out.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const langIdx = args.indexOf('--lang');
  const lang = langIdx >= 0 ? args[langIdx + 1] : 'en';
  const skip = new Set([outIdx, langIdx].filter((i) => i >= 0).map((i) => i + 1));
  const files = args.filter((a, i) => !a.startsWith('--') && !skip.has(i));
  if (!files.length) { console.error('usage: node scripts/analyze-labels.mjs export.json [more.json] [--out report.md] [--lang ko]'); process.exit(2); }
  const seen = new Set();
  const labels = files.flatMap((f) => readExport(readFileSync(f, 'utf8'))).filter((l) => (seen.has(l.id) ? false : seen.add(l.id)));
  const md = summarize(labels, { lang, files: files.map((f) => f.split('/').pop()) });
  if (outPath) { writeFileSync(outPath, md); console.error(`wrote ${outPath} (${labels.length} labels)`); } else process.stdout.write(md);
}
