/**
 * Serverless handler for the Scout demo (Vercel + standalone Node server).
 * POST /api/scout  { "sizeBytes": 176000, "durationMs": 2000, "mimeType": "audio/wav", "country": "US" }
 */

import { runScoutChecks } from '../lib/scout.mjs';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'POST /api/scout only' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const sizeBytes = Number(body?.sizeBytes);
  const durationMs = Number(body?.durationMs);
  const mimeType = String(body?.mimeType || '');
  const country = String(body?.country || 'UNKNOWN').toUpperCase();

  if (!Number.isFinite(sizeBytes) || !Number.isFinite(durationMs)) {
    return sendJson(res, 400, { error: 'sizeBytes and durationMs (numbers) are required.' });
  }

  return sendJson(res, 200, runScoutChecks({ sizeBytes, durationMs, mimeType, country }));
}
