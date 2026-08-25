/**
 * Cloudflare Worker entry point.
 *
 * - Serves static assets from ./public (the interactive UI).
 * - Handles POST /api/classify with a kill switch, a Durable-Object rate limiter,
 *   and the real koma-gate classifier.
 */

import { getClassifier } from '../lib/classify.mjs';
import { runScoutChecks } from '../lib/scout.mjs';
import { ensureSeeded, searchDocs, retrieveDoc, attemptFetch } from '../lib/core.mjs';
import { RateLimiter } from './RateLimiter.js';

// Required by wrangler so the Durable Object class is discoverable.
export { RateLimiter };

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
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

// Hard caps for the public endpoints: reject oversized bodies BEFORE JSON.parse,
// and never let the LLM see more than MAX_INPUT_LENGTH characters.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 1000;

async function readJsonBody(request, maxBytes) {
  // Fast reject via Content-Length when present.
  const lenHeader = request.headers.get('content-length');
  if (lenHeader && Number.isFinite(Number(lenHeader)) && Number(lenHeader) > maxBytes) {
    throw new Error('Request body too large (max 64 KB).');
  }
  if (!request.body) return {};

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let raw = '';
  let tooLarge = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      tooLarge = true;
      await reader.cancel().catch(() => {});
      break;
    }
    raw += decoder.decode(value, { stream: true });
  }

  if (tooLarge) throw new Error('Request body too large (max 64 KB).');
  raw += decoder.decode();

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

// Trim, cap, and strip invisible zero-width junk so whitespace-only or
// invisible payloads are rejected before they cost an LLM call.
function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .slice(0, MAX_INPUT_LENGTH)
    .trim();
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
    const rlRes = await stub.fetch('https://do/check', {
      headers: { 'X-Koma-Rate-Key': ip },
    });
    const rl = await rlRes.json();
    if (!rl.allowed) {
      const message =
        rl.reason === 'daily'
          ? 'Daily demo budget reached — please try again tomorrow.'
          : 'Rate limit exceeded — try again in a minute.';
      return json({ error: message }, 429, { 'Retry-After': String(rl.retryAfter || 60) });
    }
  }

  // 3) Parse input — capped read; oversized bodies are rejected before parsing.
  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, 400);
  }
  const input = sanitizeText(body?.text);
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
    console.error('[classify] classification failed:', err);
    return json({ error: 'Classification failed.' }, 500);
  }
}

// Scout is the LLM-free deterministic guard — pure JS, so it runs on Workers.
async function handleScout(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST /api/scout only' }, 405);
  }

  if (env?.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('global'));
    const rlRes = await stub.fetch('https://do/check?daily=0', {
      headers: { 'X-Koma-Rate-Key': ip },
    });
    const rl = await rlRes.json();
    if (!rl.allowed) {
      const message =
        rl.reason === 'daily'
          ? 'Daily demo budget reached — please try again tomorrow.'
          : 'Rate limit exceeded — try again in a minute.';
      return json({ error: message }, 429, { 'Retry-After': String(rl.retryAfter || 60) });
    }
  }

  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, 400);
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

const FEEDBACK_RETENTION_DAYS = 30;

async function handleFeedback(request, env, pathname) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (!env.FEEDBACK_DB) {
    return json({ error: 'Feedback storage is not configured.' }, 503);
  }
  const isCreate = request.method === 'POST' && pathname === '/api/feedback';
  const isDelete = request.method === 'DELETE' && pathname.startsWith('/api/feedback/');
  if (!isCreate && !isDelete) {
    return json({ error: 'POST /api/feedback or DELETE /api/feedback/:submissionId only' }, 405);
  }

  if (env.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('global'));
    const rlRes = await stub.fetch('https://do/check?daily=0', {
      headers: { 'X-Koma-Rate-Key': ip },
    });
    const rl = await rlRes.json();
    if (!rl.allowed) {
      return json({ error: 'Feedback rate limit exceeded — try again in a minute.' }, 429, {
        'Retry-After': String(rl.retryAfter || 60),
      });
    }
  }

  if (isDelete) {
    const id = decodeURIComponent(pathname.slice('/api/feedback/'.length));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return json({ error: 'Invalid submission ID.' }, 400);
    }
    try {
      await env.FEEDBACK_DB.prepare('DELETE FROM gate_feedback WHERE id = ?1').bind(id).run();
    } catch {
      console.error('[feedback] D1 deletion failed');
      return json({ error: 'Feedback could not be deleted.' }, 500);
    }
    // Do not reveal whether an arbitrary ID existed.
    return json({ deleted: true }, 200);
  }

  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, 400);
  }

  if (body?.consent !== true) {
    return json({ error: 'Explicit consent is required.' }, 400);
  }

  const prompt = sanitizeText(body.prompt);

  if (!prompt) return json({ error: 'prompt is required.' }, 400);

  const id = crypto.randomUUID();
  const submittedAt = new Date();
  const expiresAt = new Date(
    submittedAt.getTime() + FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  try {
    await env.FEEDBACK_DB.prepare(
      `INSERT INTO gate_feedback
        (id, prompt, expires_at)
       VALUES (?1, ?2, ?3)`,
    )
      .bind(
        id,
        prompt,
        expiresAt.toISOString(),
      )
      .run();
  } catch {
    console.error('[feedback] D1 write failed');
    return json({ error: 'Feedback could not be stored.' }, 500);
  }

  return json({ stored: true, submissionId: id, expiresAt: expiresAt.toISOString() }, 201);
}

const CORE_TIERS = new Set(['public', 'premium', 'enterprise']);

// Core runs the real koma-core package with an in-memory adapter. Modern
// Workers compatibility dates expose node:crypto, including hkdfSync.
async function handleCore(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST /api/core only' }, 405);
  }

  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (err) {
    return json({ error: err.message }, 400);
  }

  await ensureSeeded();

  if (body?.action === 'search') {
    const results = await searchDocs({
      category: body.category,
      tag: body.tag,
      limit: body.limit,
    });
    return json({ results }, 200);
  }

  if (body?.action === 'retrieve') {
    const displayName = String(body.displayName || '');
    const userTier = CORE_TIERS.has(body.userTier) ? body.userTier : 'public';
    if (!displayName) {
      return json({ error: 'displayName is required.' }, 400);
    }
    return json(await retrieveDoc(displayName, userTier), 200);
  }

  if (body?.action === 'attempt') {
    const id = String(body.id || '');
    if (!id) {
      return json({ error: 'id is required.' }, 400);
    }
    return json(await attemptFetch(id), 200);
  }

  return json({ error: 'action must be "search", "retrieve", or "attempt".' }, 400);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/classify') {
      return handleClassify(request, env);
    }
    if (url.pathname === '/api/scout') {
      return handleScout(request, env);
    }
    if (url.pathname === '/api/feedback' || url.pathname.startsWith('/api/feedback/')) {
      return handleFeedback(request, env, url.pathname);
    }
    if (url.pathname === '/api/core') {
      return handleCore(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    if (!env.FEEDBACK_DB) return;
    ctx.waitUntil(
      env.FEEDBACK_DB.prepare('DELETE FROM gate_feedback WHERE expires_at <= ?1')
        .bind(new Date().toISOString())
        .run(),
    );
  },
};
