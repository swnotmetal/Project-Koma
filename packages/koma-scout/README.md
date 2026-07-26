# Koma Scout

Traffic shaping, audio validation, and anti-bot middleware for AI apps.

This package provides low-cost perimeter checks for voice or upload endpoints before any expensive model work begins.

## AI Agent Quick Read

- Read order: this README, then `src/index.ts`, then [../../demo/server.js](../../demo/server.js).
- Boundary: handle rate limiting, upload validation, and geo allowlisting.
- Decision style: cheap checks first, expensive work last.
- Primary use: block bad traffic before the model or storage layer is reached.

## Agent Handoff

- Input: request metadata, file size, duration, MIME type, and optional IP or region.
- Output: pass or block, with reasons from the perimeter checks.
- Control point: `createKomaScoutMiddleware()` and the storage or validator config passed into it.
- Common mistake: using Scout as the main application policy layer instead of a perimeter filter.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

Source-first. Use the package from the workspace or bundle it into a build pipeline.

## Usage

```ts
import { createKomaScoutMiddleware } from './src';

const middlewares = createKomaScoutMiddleware({
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
- `createKomaScoutMiddleware()`
- `applyKomaScout()`
- `RateLimitConfig`
- `AudioValidationConfig`
- `GeoAllowlistConfig`

## What It Solves

- burst traffic from scripts or bots
- repeated uploads inside a short window
- near-silent or undersized audio
- unsupported audio formats
- optional geographic allowlisting

## Design

- Cheap checks first, expensive work last.
- Distributed-safe rate limiting when backed by a shared store (Firestore).
- Fail-open on optional infrastructure failures.
- Works as a standalone middleware layer.