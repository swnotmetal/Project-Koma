#!/usr/bin/env node

const http = require('http');
const { createHash, createHmac } = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const MASTER_KEY = process.env.AEGIS_MASTER_KEY || 'demo-master-key';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const MIN_AUDIO_BYTES = 8_000;

const state = {
  rateLimits: new Map(),
  indexStore: new Map(),
  contentStore: new Map(),
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function hashInput(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function deriveToken(sourceId) {
  return createHmac('sha256', MASTER_KEY).update(String(sourceId)).digest('hex').slice(0, 32);
}

function classifyScope(text) {
  const input = String(text || '').trim().toLowerCase();
  if (!input) return false;

  const allowed = [
    'how do i', 'how to', 'api', 'middleware', 'rate limit', 'security', 'database',
    'cache', 'token', 'prompt injection', 'llm', 'typescript', 'node', 'express', 'fastapi',
  ];
  const blocked = [
    'recipe', 'weather', 'sports', 'movie', 'music', 'stock', 'stock tips', 'diagnosis',
    'medical advice', 'what should i eat', 'relationship advice', 'random chat',
  ];

  if (blocked.some((phrase) => input.includes(phrase))) return false;
  return allowed.some((phrase) => input.includes(phrase)) || input.length >= 8;
}

function checkRateLimit(key) {
  const now = Date.now();
  const entry = state.rateLimits.get(key);
  const attempts = entry ? entry.attempts.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS) : [];

  if (attempts.length >= RATE_LIMIT_MAX) {
    const resetAt = attempts[0] + RATE_LIMIT_WINDOW_MS;
    return { allowed: false, retryAfter: Math.ceil((resetAt - now) / 1000), resetAt };
  }

  attempts.push(now);
  state.rateLimits.set(key, { attempts });
  return { allowed: true, retryAfter: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
}

function extractSafeMetadata(metadata = {}) {
  return {
    version: metadata.version || 1,
    format: metadata.format || 'text',
    language: metadata.language || 'en',
    tags: Array.isArray(metadata.tags) ? metadata.tags.slice(0, 8) : [],
  };
}

async function handleGuard(req, res) {
  const body = await readBody(req);
  const text = body.text || body.query || '';
  const inScope = classifyScope(text);
  return json(res, 200, { in_scope: inScope });
}

async function handleIngest(req, res) {
  const body = await readBody(req);
  const sourceId = body.sourceId;
  const displayName = body.displayName;
  const category = body.category || 'general';
  const payload = body.payload || {};

  if (!sourceId || !displayName) {
    return json(res, 400, { success: false, error: 'sourceId and displayName are required' });
  }

  const contentToken = deriveToken(sourceId);
  const contentHash = hashInput(payload);
  const indexId = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  state.contentStore.set(contentToken, {
    sourceId,
    contentToken,
    payload,
    accessTier: body.accessTier || 'public',
    accessCount: 0,
    createdAt: Date.now(),
  });

  state.indexStore.set(indexId, {
    displayName,
    category,
    tags: Array.isArray(body.tags) ? body.tags : [],
    contentHash,
    contentToken,
    metadata: extractSafeMetadata(body.metadata),
    accessTier: body.accessTier || 'public',
    createdAt: Date.now(),
  });

  return json(res, 200, {
    success: true,
    indexId,
    contentToken,
    contentHash,
    note: 'Index and content are separated; only the token links them.',
  });
}

async function handleSearch(req, res, url) {
  const query = String(url.searchParams.get('q') || '').toLowerCase();
  const results = [];

  for (const [id, doc] of state.indexStore.entries()) {
    if (!query || doc.displayName.toLowerCase().includes(query) || doc.category.toLowerCase().includes(query)) {
      results.push({
        indexId: id,
        displayName: doc.displayName,
        category: doc.category,
        tags: doc.tags,
        contentToken: doc.contentToken,
        metadata: doc.metadata,
      });
    }
  }

  return json(res, 200, { success: true, results });
}

async function handleContent(req, res, url) {
  const clientId = req.socket.remoteAddress || 'unknown';
  const rateKey = `content:${clientId}`;
  const rate = checkRateLimit(rateKey);

  if (!rate.allowed) {
    return json(res, 429, {
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: rate.retryAfter,
    });
  }

  const token = String(url.searchParams.get('token') || '');
  const entry = state.contentStore.get(token);
  if (!entry) {
    return json(res, 404, { success: false, error: 'Content not found' });
  }

  entry.accessCount += 1;
  state.contentStore.set(token, entry);

  return json(res, 200, {
    success: true,
    sourceId: entry.sourceId,
    payload: entry.payload,
    accessCount: entry.accessCount,
  });
}

async function handleSelfTest(req, res) {
  const tests = [];

  tests.push({
    name: 'scope classifier accepts technical query',
    pass: classifyScope('How do I build a rate limiting middleware in Express?') === true,
  });

  tests.push({
    name: 'scope classifier rejects recipe query',
    pass: classifyScope('How do I make kung pao chicken?') === false,
  });

  const token = deriveToken('demo-item-1');
  tests.push({
    name: 'token derivation is deterministic',
    pass: token === deriveToken('demo-item-1'),
  });

  const limitProbe1 = checkRateLimit('self-test');
  const limitProbe2 = checkRateLimit('self-test');
  tests.push({
    name: 'rate limiter records requests',
    pass: limitProbe1.allowed === true && limitProbe2.allowed === true,
  });

  const passed = tests.every((test) => test.pass);
  return json(res, passed ? 200 : 500, { success: passed, tests });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'aegis-vibe-demo' });
    }

    if (req.method === 'POST' && url.pathname === '/guard') {
      return await handleGuard(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/ingest') {
      return await handleIngest(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/search') {
      return await handleSearch(req, res, url);
    }

    if (req.method === 'GET' && url.pathname === '/content') {
      return await handleContent(req, res, url);
    }

    if (req.method === 'GET' && url.pathname === '/self-test') {
      return await handleSelfTest(req, res);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Koma demo server running on http://localhost:${PORT}`);
  console.log('Try /health, /guard, /ingest, /search, /content, and /self-test');
});
