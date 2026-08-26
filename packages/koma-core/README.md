# Koma Core

Protected split-store storage for AI apps.

This package separates searchable index records from private content records and links them with opaque backend-derived tokens.

## AI Agent Quick Read

- Read order: this README, then `src/index.ts`, then [../../demo/server.js](../../demo/server.js).
- Boundary: keep searchable records and private records separate.
- Token rule: retrieval stays backend-derived and opaque.
- Primary use: protect sensitive content while preserving discovery and search.

## Agent Handoff

- Input: an item to ingest, a token to resolve, and two storage handles.
- Output: searchable metadata plus token-addressed private content.
- Control point: `createKomaStorage()` and the writer or reader it returns.
- Common mistake: exposing private records to search or assuming tokens are client-generated.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

Source-first. Use the package from the workspace or bundle it into a build pipeline.

## Usage

```ts
import { createKomaStorage } from './src';

const storage = createKomaStorage({
  masterKey: process.env.AEGIS_MASTER_KEY || 'dev-key',
  indexDb,
  contentDb,
});

await storage.writer.ingest({
  sourceId: 'item-123',
  displayName: 'Example Item',
  category: 'docs',
  tags: ['searchable'],
  payload: { title: 'Example Item', body: 'Protected content' },
  provenance: { source: 'import', ingestedBy: 'system' },
});
```

## Exports

- `TokenDeriver`
- `ContentHasher`
- `DualCollectionWriter`
- `DualCollectionReader`
- `RateLimiter`
- `MemoryRateLimitStorage`
- `DualCollectionMigrator`
- `createKomaStorage()`
- `StorageConfig`
- `AccessTier`

## Modes

`createKomaStorage()` accepts a `mode` parameter:

```ts
// Lite: minimal split-store, no audit, no rate limiter
const storage = createKomaStorage({
  masterKey: process.env.AEGIS_MASTER_KEY!,
  indexDb,
  contentDb,
  mode: 'lite',
});

// Strict (default): audit, access-tier enforcement, rate-limited retrieval
const storage = createKomaStorage({
  masterKey: process.env.AEGIS_MASTER_KEY!,
  indexDb,
  contentDb,
  mode: 'strict',
  auditLogger: myAuditLogger,
});
```

| Feature | Lite | Strict |
|---------|------|--------|
| Split index/content | ✓ | ✓ |
| HKDF token derivation | ✓ | ✓ |
| Audit logging | — | ✓ |
| Access-tier enforcement | — | ✓ |
| Rate-limited retrieval | — | ✓ |
| Legacy migration | — | ✓ |

## Notes

- Public records stay minimal.
- Private records are token-addressed, not list-addressed.
- Token mapping stays server-side.
- Versioning and hashing make migration safer.

## What It Solves

- Accidental exposure of high-value payloads.
- Brute-force or enumerated document access.
- Search results leaking private data.
- Weak coupling between discovery and retrieval.
- Audit gaps around sensitive reads.