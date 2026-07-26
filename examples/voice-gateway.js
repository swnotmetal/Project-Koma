/**
 * Koma Scout example: voice-AI endpoint protection.
 * 
 * Run:  node examples/voice-gateway.js
 * 
 * Scenario (2025-2027): You built a voice AI that transcribes user audio via
 * Gemini. Bots flood it with silent recordings (wasting API credits) and users
 * send 30-second rants (exceeding your cost budget). Scout blocks both before
 * the expensive model call.
 */

// Simulate Koma Scout checks (in production, import from 'koma-scout')
const MIN_AUDIO_BYTES = 8000;    // ~6KB raw = silence guard
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB
const MIN_DURATION_MS = 1500;
const MAX_DURATION_MS = 12000;
const COOLDOWN_MS = 1500;

const allowedMime = new Set(['audio/mp4', 'audio/wav', 'audio/webm']);

const lastRequest = {};

function scoutCheck(clientId, sizeBytes, durationMs, mimeType) {
  const now = Date.now();

  // Cooldown
  if (lastRequest[clientId] && now - lastRequest[clientId] < COOLDOWN_MS) {
    return { pass: false, reason: 'COOLDOWN: too many requests too fast' };
  }

  // Size
  if (sizeBytes < MIN_AUDIO_BYTES) {
    return { pass: false, reason: `TOO_SMALL: ${sizeBytes} bytes (min ${MIN_AUDIO_BYTES}) — likely silence or noise` };
  }
  if (sizeBytes > MAX_AUDIO_BYTES) {
    return { pass: false, reason: `TOO_LARGE: ${sizeBytes} bytes (max ${MAX_AUDIO_BYTES})` };
  }

  // Duration
  if (durationMs < MIN_DURATION_MS) {
    return { pass: false, reason: `TOO_SHORT: ${durationMs}ms (min ${MIN_DURATION_MS}ms)` };
  }
  if (durationMs > MAX_DURATION_MS) {
    return { pass: false, reason: `TOO_LONG: ${durationMs}ms (max ${MAX_DURATION_MS}ms)` };
  }

  // MIME
  if (!allowedMime.has(mimeType)) {
    return { pass: false, reason: `INVALID_FORMAT: ${mimeType}` };
  }

  lastRequest[clientId] = now;
  return { pass: true };
}

console.log('=== Koma Scout: Voice Gateway Demo ===\n');

const requests = [
  { client: 'user-a', sizeBytes: 2000, durationMs: 300, mimeType: 'audio/mp4' },
  { client: 'user-b', sizeBytes: 16000, durationMs: 2000, mimeType: 'audio/mp4' },
  { client: 'user-b', sizeBytes: 16000, durationMs: 2000, mimeType: 'audio/mp4' }, // cooldown
  { client: 'user-c', sizeBytes: 16000, durationMs: 2000, mimeType: 'text/plain' },
  { client: 'user-d', sizeBytes: 16000, durationMs: 25000, mimeType: 'audio/mp4' },
];

for (const req of requests) {
  const { pass, reason } = scoutCheck(req.client, req.sizeBytes, req.durationMs, req.mimeType);
  if (pass) {
    console.log(`✅ PASS: ${req.client} — ${req.sizeBytes}B, ${req.durationMs}ms, ${req.mimeType}`);
  } else {
    console.log(`🚫 BLOCKED: ${req.client} — ${reason}`);
  }
}

console.log('\nReal use:   import { createKomaScoutMiddleware } from \'koma-scout\';');
console.log('           app.use(...createKomaScoutMiddleware({ rateLimit, audioValidation }));');
