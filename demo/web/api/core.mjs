/**
 * Serverless handler for the Core demo (Vercel + standalone Node server).
 * POST /api/core  { "action": "search" } | { "action": "retrieve", "sourceId": "...", "userTier": "premium" }
 */

import { ensureSeeded, searchDocs, retrieveDoc, attemptFetch } from '../lib/core.mjs';

function readBody(req, maxBytes = 16384) {
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

const TIERS = new Set(['public', 'premium', 'enterprise']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'POST /api/core only' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  await ensureSeeded();

  const action = body?.action;
  if (action === 'search') {
    const results = await searchDocs({
      category: body?.category,
      tag: body?.tag,
      limit: body?.limit,
    });
    return sendJson(res, 200, { results });
  }

  if (action === 'retrieve') {
    const displayName = String(body?.displayName || '');
    const userTier = TIERS.has(body?.userTier) ? body.userTier : 'public';
    if (!displayName) {
      return sendJson(res, 400, { error: 'displayName is required.' });
    }
    const result = await retrieveDoc(displayName, userTier);
    return sendJson(res, 200, result);
  }

  if (action === 'attempt') {
    const id = String(body?.id || '');
    if (!id) {
      return sendJson(res, 400, { error: 'id is required.' });
    }
    const result = await attemptFetch(id);
    return sendJson(res, 200, result);
  }

  return sendJson(res, 400, { error: 'action must be "search", "retrieve", or "attempt".' });
}
