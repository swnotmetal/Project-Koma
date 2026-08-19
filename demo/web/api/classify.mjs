/**
 * Serverless handler for Vercel (also reused by the standalone Node server).
 *
 * POST /api/classify  { "text": "..." }
 */

import { getClassifier } from '../lib/classify.mjs';
import { getLimiter, getIp } from '../lib/rate-limit.mjs';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20; // LLM-backed endpoint — stricter than deterministic ones
const MAX_BODY_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 1000;

const rateLimited = getLimiter('classify', MAX_PER_WINDOW, WINDOW_MS);

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > maxBytes) return reject(new Error('Request body too large.'));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'POST /api/classify only' });
  }

  if (rateLimited(getIp(req))) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: 'Rate limit exceeded — try again in a minute.' });
  }

  let body;
  try {
    body = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const input = String(body?.text ?? '').slice(0, MAX_INPUT_LENGTH).trim();
  const domain = String(body?.domain || 'general');
  if (!input) {
    return sendJson(res, 400, { error: 'Field "text" is required.' });
  }

  const classifier = getClassifier(domain);
  if (!classifier.isConfigured()) {
    return sendJson(res, 503, {
      error: 'Demo is not configured: missing LLM API key on the server.',
    });
  }

  try {
    const result = await classifier.classifyText(input);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('[classify] classification failed:', err);
    sendJson(res, 500, { error: 'Classification failed.' });
  }
}
