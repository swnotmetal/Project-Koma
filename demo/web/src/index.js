/**
 * Cloudflare Worker entry point.
 *
 * - Serves static assets from ./public (the interactive UI).
 * - Handles POST /api/classify with a kill switch, a Durable-Object rate limiter,
 *   and the real koma-gate classifier.
 */

import { getClassifier } from '../lib/classify.mjs';
import { runScoutChecks } from '../lib/scout.mjs';
import { RateLimiter } from './RateLimiter.js';

// Required by wrangler so the Durable Object class is discoverable.
export { RateLimiter };

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors(),
      ...headers,
    },
  });
}

async function handleClassify(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST /api/classify only' }, 405);
  }

  // 1) Kill switch (optional KV binding; instant off-switch from the dashboard).
  if (env.KILLSWITCH) {
    if ((await env.KILLSWITCH.get('disabled')) === 'true') {
      return json({ error: 'Demo is temporarily disabled.' }, 503);
    }
  }

  // 2) Per-IP rate limit + global daily budget (optional Durable Object binding).
  if (env.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('global'));
    const rlRes = await stub.fetch(`https://do/check?ip=${encodeURIComponent(ip)}`);
    const rl = await rlRes.json();
    if (!rl.allowed) {
      const message =
        rl.reason === 'daily'
          ? 'Daily demo budget reached — please try again tomorrow.'
          : 'Rate limit exceeded — try again in a minute.';
      return json({ error: message }, 429, { 'Retry-After': String(rl.retryAfter || 60) });
    }
  }

  // 3) Parse input.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const input = String(body?.text ?? '').slice(0, 1000).trim();
  if (!input) {
    return json({ error: 'Field "text" is required.' }, 400);
  }

  // Domain-aware: each scene maps to its own koma-gate guard (cached per domain).
  const domain = String(body?.domain || 'general');
  const c = getClassifier(domain, env);
  if (!c.isConfigured()) {
    return json({ error: 'Demo is not configured: missing LLM API key.' }, 503);
  }

  try {
    const result = await c.classifyText(input);
    return json(result, 200);
  } catch (err) {
    return json(
      { error: 'Classification failed.', detail: String(err?.message || err) },
      500,
    );
  }
}

// Scout is the LLM-free deterministic guard — pure JS, so it runs on Workers.
async function handleScout(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST /api/scout only' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const sizeBytes = Number(body?.sizeBytes);
  const durationMs = Number(body?.durationMs);
  const mimeType = String(body?.mimeType || '');
  const country = String(body?.country || 'UNKNOWN').toUpperCase();
  const clientId = String(body?.clientId || 'anonymous');

  if (!Number.isFinite(sizeBytes) || !Number.isFinite(durationMs)) {
    return json({ error: 'sizeBytes and durationMs (numbers) are required.' }, 400);
  }

  return json(runScoutChecks({ sizeBytes, durationMs, mimeType, country, clientId }), 200);
}

// koma-core depends on Node's crypto.hkdfSync, which Workers do not expose.
// Return an honest, actionable message instead of a 404.
function handleCore(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  return json(
    {
      error: 'The Core demo needs a Node server — koma-core uses Node crypto.hkdfSync, which Cloudflare Workers does not expose.',
      hint: 'Run the full 3-tab demo locally with "npm run demo", or deploy the Node server to Railway/Zeabur.',
      nodeOnly: true,
    },
    501,
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/classify') {
      return handleClassify(request, env);
    }
    if (url.pathname === '/api/scout') {
      return handleScout(request);
    }
    if (url.pathname === '/api/core') {
      return handleCore(request);
    }
    return env.ASSETS.fetch(request);
  },
};
