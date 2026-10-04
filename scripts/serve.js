// Minimal static file server (Node built-ins only) for local development.
// Usage: npm start   (or: node scripts/serve.js [port])
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../docs', import.meta.url)));
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) throw Object.assign(new Error('forbidden'), { code: 403 });
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(e.code === 403 ? 'Forbidden' : 'Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Attune on http://127.0.0.1:${PORT}`));
