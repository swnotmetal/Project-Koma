# Koma Scout

Traffic shaping, audio validation, and anti-bot middleware for AI apps.

This package provides low-cost perimeter checks for voice or upload endpoints before any expensive model work begins.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

Source-first. Use the package from the workspace or bundle it into a build pipeline.

## Usage

```ts
import { createVibeShieldMiddleware } from './src';

const middlewares = createVibeShieldMiddleware({
  rateLimit: {
    keyPrefix: 'api:',
    maxRequests: 30,
    windowMs: 60_000,
  },
  audioValidation: {
    maxSizeBytes: 5 * 1024 * 1024,
    minSizeBytes: 8_000,
    maxDurationMs: 12_000,
    minDurationMs: 1_500,
    allowedMimeTypes: ['audio/mp4', 'audio/wav'],
    cooldownMs: 1_500,
  },
});

middlewares.forEach((mw) => app.use(mw));
```

## Exports

- `MemoryRateLimitStorage`
- `FirestoreRateLimitStorage`
- `AudioValidator`
- `GeoAllowlist`
- `createVibeShieldMiddleware()`
- `applyVibeShield()`
- `RateLimitConfig`
- `AudioValidationConfig`
- `GeoAllowlistConfig`

## What It Solves

- burst traffic from scripts or bots
- repeated uploads inside a short window
- near-silent or undersized audio
- unsupported audio formats
- optional geographic allowlisting

## Notes

- cheap checks first, expensive checks last
- distributed-safe rate limiting when backed by a shared store
- fail-open on optional infrastructure failures
- works as a standalone middleware layer