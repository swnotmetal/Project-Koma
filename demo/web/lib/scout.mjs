/**
 * Deterministic Scout checks for the demo.
 *
 * Mirrors koma-scout's AudioValidator + GeoAllowlist default thresholds
 * (size / duration / MIME / country). Scout is the cheap, LLM-free guard that
 * drops obviously-abusive traffic before it reaches expensive processing.
 */

export const SCOUT_POLICY = Object.freeze({
  maxSizeBytes: 5 * 1024 * 1024,
  minSizeBytes: 8_000,
  maxDurationMs: 12_000,
  minDurationMs: 1_500,
  burstWindowMs: 1_500,
  burstMax: 3,
  allowedCountries: ['US', 'FI'],
});
const ALLOWED_MIME = new Set([
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/mp3',
  'audio/webm',
]);
const ALLOWED_COUNTRIES = new Set(SCOUT_POLICY.allowedCountries);

// Simple in-memory burst limiter (mirrors koma-scout's cooldown concept).
const recentHits = new Map();

export function runScoutChecks({ sizeBytes, durationMs, mimeType, country, clientId = 'anonymous' }) {
  const startedAt = performance.now();
  const now = Date.now();
  const hits = (recentHits.get(clientId) || []).filter(
    (t) => now - t < SCOUT_POLICY.burstWindowMs,
  );

  const checks = {
    mime: ALLOWED_MIME.has(mimeType),
    size: sizeBytes >= SCOUT_POLICY.minSizeBytes && sizeBytes <= SCOUT_POLICY.maxSizeBytes,
    duration:
      durationMs >= SCOUT_POLICY.minDurationMs &&
      durationMs <= SCOUT_POLICY.maxDurationMs,
    country: country === 'LOCAL' || ALLOWED_COUNTRIES.has(country),
    rate: hits.length < SCOUT_POLICY.burstMax,
  };

  hits.push(now);
  recentHits.set(clientId, hits);

  const passed = Object.values(checks).every(Boolean);
  const failed = Object.keys(checks).filter((k) => !checks[k]);

  return {
    passed,
    checks,
    failed,
    stoppedAt: failed[0] || null,
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    policy: SCOUT_POLICY,
    summary: passed
      ? 'Scout passed: every pre-flight check succeeded.'
      : `Scout blocked early: ${failed.join(', ')}.`,
  };
}
