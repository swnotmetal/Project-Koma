/**
 * Deterministic Scout checks for the demo.
 *
 * Mirrors koma-scout's AudioValidator + GeoAllowlist default thresholds
 * (size / duration / MIME / country). Scout is the cheap, LLM-free guard that
 * drops obviously-abusive traffic before it reaches expensive processing.
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_SIZE = 8_000; // ~6KB
const MAX_DURATION = 12_000; // 12s
const MIN_DURATION = 1_500; // 1.5s
const ALLOWED_MIME = new Set([
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/mp3',
  'audio/webm',
]);
const ALLOWED_COUNTRIES = new Set(['US', 'FI']);

// Simple in-memory burst limiter (mirrors koma-scout's cooldown concept).
const BURST_WINDOW_MS = 1500;
const BURST_MAX = 3;
const recentHits = new Map();

export function runScoutChecks({ sizeBytes, durationMs, mimeType, country, clientId = 'anonymous' }) {
  const now = Date.now();
  const hits = (recentHits.get(clientId) || []).filter((t) => now - t < BURST_WINDOW_MS);

  const checks = {
    size: sizeBytes >= MIN_SIZE && sizeBytes <= MAX_SIZE,
    duration: durationMs >= MIN_DURATION && durationMs <= MAX_DURATION,
    mime: ALLOWED_MIME.has(mimeType),
    country: country === 'LOCAL' || ALLOWED_COUNTRIES.has(country),
    rate: hits.length < BURST_MAX,
  };

  hits.push(now);
  recentHits.set(clientId, hits);

  const passed = Object.values(checks).every(Boolean);
  const failed = Object.keys(checks).filter((k) => !checks[k]);

  return {
    passed,
    checks,
    failed,
    summary: passed
      ? 'Scout passed: every pre-flight check succeeded.'
      : `Scout blocked early: ${failed.join(', ')}.`,
  };
}
