// Re-render docs/media/hero.{mp4,webm} + hero-poster.webp from the landing-page story (docs/js/story.js), frame by frame.
// Usage: node --experimental-websocket scripts/record-hero.mjs [--chrome <path>] [--fps 15]   (Node 22+: no flag; needs ffmpeg)
// Headless Chrome on 127.0.0.1 only; each frame is a deterministic seek ('tempoloon:story-seek'), then a clipped screenshot.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));
const CHROME = arg('--chrome', process.env.CHROME || 'google-chrome');
const FPS = Number(arg('--fps', 15)), STORY_MS = 42000, W = 1088, H = 684;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  const file = normalize(join(DOCS, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(DOCS)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = await mkdtemp(join(tmpdir(), 'tempoloon-rec-'));
const frames = await mkdtemp(join(tmpdir(), 'tempoloon-frames-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, bad) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) ok(m[1]); });
  setTimeout(() => bad(new Error('chrome did not start')), 15000);
});
const target = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } });
const cdp = (method, params = {}) => new Promise((ok, bad) => { const id = ++seq; waiting.set(id, (d) => (d.error ? bad(new Error(`${method}: ${d.error.message}`)) : ok(d.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

try {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await cdp('Page.navigate', { url: `${base}/index.html` });
  for (let i = 0; i < 100 && !(await ev(`!!document.querySelector('#st-phase-title')?.textContent`).catch(() => false)); i += 1) await sleep(100);
  await ev(`document.querySelector('.st-grid').scrollIntoView({ block: 'center' }); true`);
  await sleep(800);
  const total = Math.round((STORY_MS / 1000) * FPS);
  for (let i = 0; i <= total; i += 1) {
    const t = Math.min(STORY_MS, Math.round((i * 1000) / FPS));
    const r = await ev(`new Promise((ok) => { document.dispatchEvent(new CustomEvent('tempoloon:story-seek', { detail: { t: ${t} } }));
      requestAnimationFrame(() => requestAnimationFrame(() => { const b = document.querySelector('.st-grid').getBoundingClientRect(); ok({ x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }); })); })`);
    const pad = 16, clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad }; clip.scale = W / clip.width; // render at the output width (no upscaling blur)
    const shot = await cdp('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    await writeFile(join(frames, `${String(i).padStart(4, '0')}.png`), Buffer.from(shot.data, 'base64'));
  }
  const media = join(DOCS, 'media');
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`;
  const inp = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(frames, '%04d.png'), '-vf', vf];
  execFileSync('ffmpeg', [...inp, '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-movflags', '+faststart', '-an', join(media, 'hero.mp4')]);
  execFileSync('ffmpeg', [...inp, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-an', join(media, 'hero.webm')]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(frames, '0000.png'), '-vf', vf.replace(',format=yuv420p', ''), '-quality', '82', join(media, 'hero-poster.webp')]);
  console.log(`hero video re-rendered: ${total + 1} frames at ${FPS} fps`);
} finally {
  ws.close(); chrome.kill(); server.close();
  await new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r)));
  await rm(profile, { recursive: true, force: true }); await rm(frames, { recursive: true, force: true });
}
