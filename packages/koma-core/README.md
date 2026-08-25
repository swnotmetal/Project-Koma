# Koma Core

Protected split-store storage for AI apps.

This package separates searchable index records from private content records and links them with opaque backend-derived tokens.

## Security Boundary

Koma Core provides the storage pattern (index/content separation), but the integrating application is responsible for deriving a trustworthy `userTier` from authenticated identity. Core does not authenticate users or authorize access tiers — it enforces the tier the application passes in. Always verify identity before calling storage methods.

### What Core Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Token opacity | HKDF-derived tokens cannot be reversed to sourceId |
| Storage separation | Index (searchable) and content (private) are different stores |
| Retrieval throttling | Per-token and per-IP rate limiting |
| Deterministic tokens | Same sourceId always produces the same token |
| Deterministic hashing | Same payload always produces the same content hash |

### What Core Does NOT Guarantee

| Non-guarantee | Responsibility |
|---------------|---------------|
| User authentication | Application must verify identity before calling Core |
| Authorization identity | Application must derive `userTier` from authenticated session, not from request body |
| Database encryption | Use your database's encryption-at-rest |
| Cross-store atomicity | Writes are best-effort with rollback; for strict transactional consistency, use a transactional backend |
| Tenant isolation | Separate Core instances per tenant, not a single shared instance |

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

```bash
npm install koma-core
```

## Usage

```ts
import { createKomaStorage } from 'koma-core';

const storage = createKomaStorage({
  masterKey: process.env.AEGIS_MASTER_KEY,
  indexDb,   // Firestore / MongoDB / etc.
  contentDb, // Firestore / MongoDB / etc.
});

// Write: public index + private content, linked by opaque token
const result = await storage.writer.ingest({
  sourceId: 'doc-42',
  displayName: 'Meeting Notes',
  category: 'internal',
  payload: { title: 'Meeting Notes', body: 'Confidential content' },
});

// Read: public search results do not contain the content token.
const hits = await storage.reader.search({ category: 'internal' });

// In an authenticated backend route, resolve the selected hit to the sourceId
// that your application already owns, then derive and fetch content internally.
const detail = await storage.reader.fetchBySourceId('doc-42', 'enterprise');
```

## Exports

### Main Factory

| Export | What it does | When to use |
|---|---|---|
| `createKomaStorage()` | Creates writer + reader + token deriver from two database handles. | Main entry point for all projects |

### Storage Components

| Export | What it does |
|---|---|
| `DualCollectionWriter` | Ingests data: writes lightweight metadata to the index, full payload to the content store. |
| `DualCollectionReader` | Reads data: searches the index, then fetches content by token with optional rate limiting. |
| `TokenDeriver` | HKDF-based deterministic token generator. Same sourceId always produces the same token. |
| `ContentHasher` | SHA-256 hash of the payload for integrity verification. |
| `DualCollectionMigrator` | Batch migration from a legacy flat collection into the dual-store format. |

### Shared Utilities

| Export | What it does |
|---|---|
| `RateLimiter` | Per-token or per-IP read rate limiter. Prevents content enumeration. |
| `MemoryRateLimitStorage` | In-memory backend for RateLimiter. |

### Config Types

`StorageConfig` — TypeScript type for the full storage configuration.

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
