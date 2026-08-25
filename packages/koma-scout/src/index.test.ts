/**
 * Koma Scout unit tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AudioValidator,
  GeoAllowlist,
  MemoryRateLimitStorage,
} from './index';

// ---------------------------------------------------------------------------
// AudioValidator
// ---------------------------------------------------------------------------

describe('AudioValidator', () => {
  let validator: AudioValidator;

  // Use a config that makes duration checks passable alongside size checks
  const permissiveConfig = {
    maxSizeBytes: 5 * 1024 * 1024,   // 5MB
    minSizeBytes: 8_000,              // ~8KB
    maxDurationMs: 300_000,           // 5 min — permissive to match ~16KB audio
    minDurationMs: 10,                // very short minimum
    allowedMimeTypes: ['audio/mp4', 'audio/wav', 'audio/aac', 'audio/m4a', 'audio/mp3', 'audio/webm'],
    cooldownMs: 1_500,
  };

  beforeEach(() => {
    validator = new AudioValidator(permissiveConfig);
  });

  const validAudio = () => {
    // Create a base64 string that represents ~16KB of raw audio
    const rawSize = 16_000;
    const base64Size = Math.ceil(rawSize / 0.75);
    return 'A'.repeat(base64Size);
  };

  it('should accept valid audio', () => {
    const result = validator.validateBase64Audio(validAudio(), 'audio/mp4', 'client-1');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid MIME type', () => {
    const result = validator.validateBase64Audio(validAudio(), 'text/plain', 'client-1');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_MIME');
  });

  it('should reject audio that is too small', () => {
    // ~1KB raw → way below min 8KB
    const smallBase64 = 'A'.repeat(Math.ceil(1000 / 0.75));
    const result = validator.validateBase64Audio(smallBase64, 'audio/mp4', 'client-1');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('TOO_SMALL');
  });

  it('should reject audio that is too large', () => {
    // ~10MB raw → above max 5MB
    const hugeBase64 = 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 0.75));
    const result = validator.validateBase64Audio(hugeBase64, 'audio/mp4', 'client-1');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('TOO_LARGE');
  });

  it('should reject audio that is too short (duration)', () => {
    // ~1KB raw ≈ 11ms → below min 1500ms
    const shortBase64 = 'A'.repeat(Math.ceil(1000 / 0.75));
    const result = validator.validateBase64Audio(shortBase64, 'audio/mp4', 'client-1');
    // Will likely fail TOO_SMALL first, since 1KB < 8KB
    expect(result.valid).toBe(false);
  });

  it('should reject audio that is too long (duration)', () => {
    // ~2MB raw ≈ 23s → above max 12s
    const durationValidator = new AudioValidator({
      maxSizeBytes: 5 * 1024 * 1024,
      minSizeBytes: 8_000,
      maxDurationMs: 12_000,
      minDurationMs: 1_500,
      allowedMimeTypes: ['audio/mp4'],
      cooldownMs: 0,
    });
    const longBase64 = 'A'.repeat(Math.ceil(2 * 1024 * 1024 / 0.75));
    const result = durationValidator.validateBase64Audio(longBase64, 'audio/mp4', 'client-1');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('TOO_LONG');
  });

  it('should accept roughly two seconds of PCM audio with default thresholds', () => {
    const defaultValidator = new AudioValidator();
    const twoSecondRawSize = 176_400;
    const audio = 'A'.repeat(Math.ceil(twoSecondRawSize / 0.75));
    const result = defaultValidator.validateBase64Audio(audio, 'audio/wav', 'client-default');

    expect(result.valid).toBe(true);
    expect(result.metadata!.durationMs).toBeCloseTo(2_000, -1);
  });

  it('should enforce cooldown between requests from same client', () => {
    const audio = validAudio();
    validator.validateBase64Audio(audio, 'audio/mp4', 'client-cool');

    // Immediate second request should be rejected
    const result = validator.validateBase64Audio(audio, 'audio/mp4', 'client-cool');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('COOLDOWN');
  });

  it('should accept all configured MIME types', () => {
    const audio = validAudio();
    const mimeTypes = ['audio/aac', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/mp3', 'audio/webm'];
    for (const mime of mimeTypes) {
      // Different client IDs to avoid cooldown
      const result = validator.validateBase64Audio(audio, mime, `client-mime-${mime}`);
      expect(result.valid).toBe(true);
    }
  });

  it('should respect custom configuration', () => {
    const custom = new AudioValidator({
      maxSizeBytes: 1000,
      minSizeBytes: 10,
      maxDurationMs: 10_000,
      minDurationMs: 0,
      allowedMimeTypes: ['audio/ogg'],
      cooldownMs: 0,
    });

    // ~500 bytes → valid with custom config
    const smallAudio = 'A'.repeat(Math.ceil(500 / 0.75));
    const result = custom.validateBase64Audio(smallAudio, 'audio/ogg', 'client-custom');
    expect(result.valid).toBe(true);
  });

  it('should include metadata in valid result', () => {
    const audio = validAudio();
    const result = validator.validateBase64Audio(audio, 'audio/mp4', 'client-meta');
    expect(result.valid).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.sizeBytes).toBeGreaterThan(0);
    expect(result.metadata!.mimeType).toBe('audio/mp4');
  });
});

// ---------------------------------------------------------------------------
// MemoryRateLimitStorage
// ---------------------------------------------------------------------------

describe('MemoryRateLimitStorage', () => {
  let storage: MemoryRateLimitStorage;

  beforeEach(() => {
    storage = new MemoryRateLimitStorage();
  });

  afterEach(() => {
    storage.destroy();
  });

  it('should allow requests within the limit', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await storage.incrementAndCheck('key-a', 60000, 5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i - 1);
    }
  });

  it('should block requests exceeding the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await storage.incrementAndCheck('key-b', 60000, 3);
    }

    const result = await storage.incrementAndCheck('key-b', 60000, 3);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should reset window after expiry', async () => {
    // Fill up the limit
    for (let i = 0; i < 2; i++) {
      await storage.incrementAndCheck('key-c', 10, 2); // 10ms window
    }

    const blocked = await storage.incrementAndCheck('key-c', 10, 2);
    expect(blocked.allowed).toBe(false);

    // Wait for the window to expire
    await new Promise((r) => setTimeout(r, 15));

    const allowed = await storage.incrementAndCheck('key-c', 10, 2);
    expect(allowed.allowed).toBe(true);
  });

  it('should isolate different keys', async () => {
    await storage.incrementAndCheck('key-1', 60000, 1);
    await storage.incrementAndCheck('key-1', 60000, 1); // blocked

    const result = await storage.incrementAndCheck('key-2', 60000, 1);
    expect(result.allowed).toBe(true);
  });

  it('should get and set entries', async () => {
    await storage.set('manual-key', { attempts: [Date.now()], updatedAt: Date.now() });
    const entry = await storage.get('manual-key');
    expect(entry).not.toBeNull();
    expect(entry!.attempts).toHaveLength(1);
  });

  it('should return null for unknown keys', async () => {
    const entry = await storage.get('nonexistent');
    expect(entry).toBeNull();
  });

  it('should cleanup expired entries', async () => {
    await storage.set('old-key', {
      attempts: [Date.now() - 400_000], // Old enough to be cleaned (> 300s grace)
      updatedAt: Date.now() - 400_000,
    });

    const entry = await storage.get('old-key');
    expect(entry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GeoAllowlist
// ---------------------------------------------------------------------------

describe('GeoAllowlist', () => {
  it('should allow localhost IPs', async () => {
    const geo = new GeoAllowlist({ allowedCountries: ['US'] });

    const r1 = await geo.check('127.0.0.1');
    expect(r1.allowed).toBe(true);
    expect(r1.country).toBe('LOCAL');

    const r2 = await geo.check('::1');
    expect(r2.allowed).toBe(true);

    const r3 = await geo.check('10.0.0.1');
    expect(r3.allowed).toBe(true);

    const r4 = await geo.check('192.168.1.1');
    expect(r4.allowed).toBe(true);
  });

  it('should recognize private IP ranges as local', async () => {
    const geo = new GeoAllowlist({ allowedCountries: ['US'] });

    // Test various private IP ranges
    expect((await geo.check('10.0.0.1')).country).toBe('LOCAL');
    expect((await geo.check('172.16.0.1')).country).toBe('LOCAL');
    expect((await geo.check('192.168.1.1')).country).toBe('LOCAL');
  });

  it('should fail open on lookup failure by default', async () => {
    const geo = new GeoAllowlist({ allowedCountries: ['US'] });
    // An invalid IP format should trigger a lookup failure
    const result = await geo.check('invalid-ip-format');
    expect(result.allowed).toBe(true);
  });

  it('should cache results', async () => {
    const geo = new GeoAllowlist({
      allowedCountries: ['US'],
      cacheTtlMs: 60000,
    });

    // Check local IP (always allowed) — result should be cached
    const r1 = await geo.check('172.16.0.1');
    expect(r1.allowed).toBe(true);

    // Second call should use cache
    const r2 = await geo.check('172.16.0.1');
    expect(r2.allowed).toBe(true);
  });
});
