// Drive scripts/ext-harness.html in headless Chrome with REAL (trusted) mouse + keys and count fake-composer submits.
// Usage: node --experimental-websocket scripts/ext-harness-check.mjs [--root <dir>] [--chrome <path>]
// (Node 22+ has WebSocket built in.) Exit code 0 = zero submits from the widget in every run; prints a JSON report.
// --root serves another checkout (e.g. an old commit) to compare. Nothing leaves the machine: 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = resolve(arg('--root', fileURLToPath(new URL('..', import.meta.url))));
const CHROME = arg('--chrome', process.env.CHROME || 'google-chrome');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  const file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { const b = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(b); } catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = await mkdtemp(join(tmpdir(), 'tempoloon-harness-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1200,800', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, bad) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) ok(m[1]); });
  setTimeout(() => bad(new Error('chrome did not start')), 15000);
});
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map();
const pageErrors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
});
const cdp = (method, params = {}) => new Promise((ok, bad) => { const id = ++seq; waiting.set(id, (d) => (d.error ? bad(new Error(`${method}: ${d.error.message}`)) : ok(d.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expr); return r.result.value; };

await cdp('Runtime.enable');
const KEYS = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], ArrowRight: [39, 'ArrowRight'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], Home: [36, 'Home'], End: [35, 'End'], ' ': [32, 'Space', ' '], Tab: [9, 'Tab'] };
async function key(k, { shift = false, repeat = false } = {}) {
  const [vk, code, text] = KEYS[k];
  const common = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
  await cdp('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...common, ...(text ? { text, unmodifiedText: text } : {}), autoRepeat: repeat });
  if (!repeat) await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  await sleep(60);
}
const S = (sel) => `document.getElementById('tempoloon-load-fab').shadowRoot.querySelector(${JSON.stringify(sel)})`;
async function center(expr) { return ev(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); }
async function hover(expr) { const p = await center(expr); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p }); await sleep(120); }
async function click(expr) {
  const p = await center(expr);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
  await sleep(250);
}
const state = () => ev(`({ submits: __h.submits.length, why: __h.submits.map((s) => s.why), leaks: __h.leaks.slice(), text: __h.text(), html: (__h.box.innerHTML || '').slice(0, 300), open: ${S('.panel')}.hidden === false, chip: ${S('.chip')}.hidden === false, focus: document.activeElement?.id === 'tempoloon-load-fab' ? 'widget:' + (document.getElementById('tempoloon-load-fab').shadowRoot.activeElement?.className || '?') : (document.activeElement === __h.box ? 'composer' : document.activeElement?.tagName), level: ${S('.wrap')}.dataset.level })`);

async function run(query) {
  await cdp('Page.navigate', { url: `${base}/scripts/ext-harness.html?${query}` });
  for (let i = 0; i < 100 && !(await ev(`document.title === 'ready'`).catch(() => false)); i += 1) await sleep(50);
  const steps = [];
  const log = async (name) => { const s = await state(); steps.push({ step: name, ...s }); return s; };
  // 1. hover mascot, open faces, hover heavy, Escape (the reported sequence)
  await hover(S('.main')); await log('hover mascot');
  await click(S('.main')); await hover(S('.face[data-lv="overloaded"]')); await log('open + hover heavy');
  await key('Escape'); await log('Escape (panel open, heavy hovered)');
  await key('Escape'); await log('Escape again (focus on mascot)');
  // 2. mouse pick heavy, then Escape, then Undo
  await click(S('.main')); await hover(S('.face[data-lv="overloaded"]')); await click(S('.face[data-lv="overloaded"]')); await sleep(200);
  await log('mouse pick heavy (empty box)');
  await key('Escape'); await log('Escape after pick');
  await click(S('.undo')); await sleep(200); await log('Undo (mouse)');
  // 3. keyboard: focus mascot, Enter opens, arrows, Escape, Space opens, End = heavy, Enter picks, held Enter repeats
  await ev(`${S('.main')}.focus()`);
  await key('Enter'); await log('kbd Enter on mascot (opens)');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) await key(k);
  await log('kbd arrows/Home/End');
  await key('Escape'); await log('kbd Escape (closes, focus to mascot)');
  await key(' '); await key('End'); await key('Enter'); await sleep(250); await log('kbd Space, End, Enter = pick heavy');
  await key('Enter', { repeat: true }); await key('Enter', { repeat: true }); await log('held Enter (auto-repeat) after pick');
  await key('Escape'); await key('Escape'); await log('kbd Escape x2 after pick');
  // 4. user draft with a soft line break, keyboard pick medium, swap to heavy, keyboard Undo
  await click(S('.undo')); await sleep(200);
  await ev(`__h.box.focus()`); await cdp('Input.insertText', { text: 'hello' }); await key('Enter', { shift: true }); await cdp('Input.insertText', { text: 'world' }); await sleep(100);
  await log('user typed hello / Shift+Enter / world');
  await ev(`${S('.main')}.focus()`); await key('Enter'); await key('Home'); await key('ArrowRight'); await key('Enter'); await sleep(250);
  await log('kbd pick medium over the draft');
  await key('Enter'); await key('End'); await key('Enter'); await sleep(250); await log('kbd pick heavy (swap note)');
  await ev(`${S('.undo')}.focus()`); await key('Enter'); await sleep(250); await log('kbd Undo');
  const widgetSubmits = (await state()).submits;
  // 5. sanity: a genuine user Enter in the composer DOES send (proves the fake composer detects sends)
  await ev(`__h.box.focus()`); await key('Enter'); const sanity = await log('genuine user Enter in composer');
  return { query, widgetSubmits, genuineSendDetected: sanity.submits === widgetSubmits + 1, leaks: sanity.leaks.length, pageErrors: pageErrors.splice(0), steps };
}

const report = [];
if (arg('--eval')) { // debugging aid: load one harness page and print an expression's value
  await cdp('Page.navigate', { url: `${base}/scripts/ext-harness.html?${arg('--only', 'composer=pm')}` });
  for (let i = 0; i < 100 && !(await ev(`document.title === 'ready'`).catch(() => false)); i += 1) await sleep(50);
  console.log(JSON.stringify(await ev(arg('--eval')).catch((e) => String(e)), null, 1), pageErrors);
  ws.close(); chrome.kill(); server.close(); process.exit(0);
}
try {
  const only = arg('--only', '');
  for (const q of ['composer=pm', 'composer=pm&nl=1', 'composer=textarea', 'composer=textarea&nl=1']) if (!only || q === only) report.push(await run(q));
} finally {
  ws.close(); chrome.kill(); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
const verbose = process.argv.includes('--verbose');
console.log(JSON.stringify(verbose ? report : report.map(({ steps, ...r }) => ({ ...r, finalText: steps.at(-2).text })), null, 1));
const ok = report.every((r) => r.widgetSubmits === 0 && r.genuineSendDetected && r.leaks === 0 && !r.pageErrors.length);
console.log(ok ? 'PASS: 0 submits from the widget in every run' : 'FAIL');
process.exit(ok ? 0 : 1);
