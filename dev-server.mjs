// Local development server: serves /public and routes /api/* to the same handler Netlify uses.
// Usage: node dev-server.mjs   (PORT defaults to 3000; reads .env if present)

import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

if (existsSync(path.join(root, '.env'))) {
  for (const line of (await fs.readFile(path.join(root, '.env'), 'utf8')).split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { handle } = await import('./netlify/lib/handlers.mjs');
const PUBLIC = path.join(root, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const webReq = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
        const out = await handle(webReq);
        const headers = {};
        out.headers.forEach((v, k) => (headers[k] = v));
        const sc = out.headers.getSetCookie?.();
        if (sc?.length) headers['set-cookie'] = sc;
        res.writeHead(out.status, headers);
        res.end(Buffer.from(await out.arrayBuffer()));
        return;
      }
      let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
      if (!file.startsWith(PUBLIC)) throw new Error('forbidden');
      let stat = await fs.stat(file).catch(() => null);
      if (stat?.isDirectory()) {
        file = path.join(file, 'index.html');
        stat = await fs.stat(file).catch(() => null);
      }
      if (!stat) {
        // SPA fallback, but real 404 for missing assets.
        if (path.extname(url.pathname)) {
          res.writeHead(404).end('Not found');
          return;
        }
        file = path.join(PUBLIC, 'index.html');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(await fs.readFile(file));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('Server error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`CV-Certify running at http://localhost:${port}  (storage: ${process.env.NETLIFY_DATABASE_URL ? 'postgres' : 'local file .data/db.json'}, AI: ${process.env.ANTHROPIC_API_KEY ? 'on' : 'basic mode'})`));
}
