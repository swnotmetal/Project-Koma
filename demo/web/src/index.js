/**
 * Cloudflare Worker entry point.
 *
 * - Serves static assets from ./public (the interactive UI).
 * - Handles POST /api/classify with a kill switch, a Durable-Object rate limiter,
 *   and the real koma-gate classifier.
 */

import { createClassifier, resolveConfig } from '../lib/classify.mjs';
import { RateLimiter } from './RateLimiter.js';

// Required by wrangler so the Durable Object class is discoverable.
export { RateLimiter };

let classifier = null;

function getClassifier(env) {
  // The guard keeps an internal LRU cache, so reusing a single instance both
  // cuts latency and reduces LLM cost for repeated inputs.
  if (!classifier) {
    classifier = createClassifier(resolveConfig(env));
  }
  return classifier;
}

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

  // 4) Classify with the real koma-gate LLM firewall.
  const c = getClassifier(env);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/classify') {
      return handleClassify(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
