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
- `DualCollectionMigrator`
- `createKomaStorage()`
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

Use this for the architecture pattern without the full access-control stack.

### Core Strict

A hardened variant for production:

- access tiers
- per-token read limits
- audit logging
- access counters
- safer migration path from legacy data

Use this when the content layer must stay tightly controlled.

## Design

- Public records stay minimal (metadata only).
- Private records are token-addressed, not list-addressable.
- Token mapping stays server-side.
- Versioning and hashing make migration safer.