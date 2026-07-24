# Koma Core

Protected split-store storage for AI apps.

This package separates searchable index records from private content records and links them with opaque backend-derived tokens.

## Entry Point

- Source entry: `src/index.ts`
- Import from this monorepo: `./src`

## Install

This repository is source-first. Use the package from the workspace or bundle it into your own build pipeline.

## Usage

```ts
import { createVibeShieldStorage } from './src';

const storage = createVibeShieldStorage({
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
- `DualCollectionMigrator`
- `createVibeShieldStorage()`
- `StorageConfig`

## What It Solves

- accidental exposure of high-value payloads
- brute-force or enumerated document access
- search results leaking private data
- weak coupling between discovery and retrieval
- audit gaps around sensitive reads

## Modes

### Core Lite

A beginner-friendly split-store pattern:

- public index layer for search and discovery
- private content layer for exact-token retrieval
- deterministic token mapping from a backend secret

Use this when you want the architecture pattern without the full access-control stack.

### Core Strict

A hardened variant for production:

- access tiers
- per-token read limits
- audit logging
- access counters
- safer migration path from legacy data

Use this when the content layer must stay tightly controlled.

## Notes

- public records stay minimal
- private records are token-addressed, not list-addressed
- token mapping stays server-side
- versioning and hashing make migration safer