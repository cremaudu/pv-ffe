// Serveur local de secours (sans wrangler) : sert public/ et fait tourner le worker dans Node.
// Usage : node dev.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import worker, { recharger } from './src/worker.js';

const mem = new Map();
// Faux KV en mémoire + accès aux fichiers de public/ pour le worker
const kv = new Map();
const env = {
  CACHE: {
    async get(k, type) { const v = kv.get(k)?.value ?? null; return v && type === 'json' ? JSON.parse(v) : v; },
    async getWithMetadata(k, type) { const e = kv.get(k); return { value: e ? (type === 'json' ? JSON.parse(e.value) : e.value) : null, metadata: e?.metadata ?? null }; },
    async put(k, value, o) { kv.set(k, { value, metadata: o?.metadata ?? null }); },
  },
  ASSETS: { fetch: async (r) => new Response(await readFile(join('public', new URL(r.url).pathname))) },
};
globalThis.caches = { default: { match: async (k) => mem.get(k.url)?.clone(), put: async (k, r) => void mem.set(k.url, r) } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const port = +process.argv[2] || 8787;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const init = req.method === 'POST' ? { method: 'POST', body: Buffer.concat(chunks), headers: { 'Content-Type': 'application/json' } } : {};
    const r = url.pathname === '/api/dev-cron' ? Response.json(await recharger(env)) : await worker.fetch(new Request(url, init), env, { waitUntil() {} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  const file = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  try {
    const data = await readFile(join('public', file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(port, () => console.log('http://localhost:' + port));
