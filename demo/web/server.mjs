/**
 * Standalone server for local development, Railway, and Zeabur.
 *
 * Serves the static UI from ./public and three demo endpoints:
 *   POST /api/classify — Koma Gate  (LLM prompt-injection firewall)
 *   POST /api/scout    — Koma Scout (deterministic early-stage checks)
 *   POST /api/core     — Koma Core  (split-store retrieval)
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import classifyHandler from './api/classify.mjs';
import scoutHandler from './api/scout.mjs';
import coreHandler from './api/core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (Node 18 has no --env-file). Never overrides an existing var.
const ENV_PATH = path.join(__dirname, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const API_ROUTES = {
  '/api/classify': classifyHandler,
  '/api/scout': scoutHandler,
  '/api/core': coreHandler,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  const route = API_ROUTES[url.pathname];
  if (route && req.method === 'POST') {
    return route(req, res);
  }

  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));

  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const data = await readFile(resolved);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Koma demo running at http://localhost:${PORT}`);
});
