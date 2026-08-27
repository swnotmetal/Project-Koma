# Koma Core

Protected split-store storage for AI apps.

This package separates searchable index records from private content records and links them with opaque backend-derived tokens.

## Security Boundary

Koma Core provides the storage pattern, but the integrating application must derive a trustworthy `userTier` from authenticated identity. Core does not authenticate users; it enforces the tier the application passes in.

### What Core Guarantees

| Guarantee | Mechanism |
|---|---|
| Token opacity | HKDF-derived tokens cannot be reversed to `sourceId` |
| Storage separation | Searchable index and private content use different stores |
| Public-search redaction | Search omits `contentToken` unless a trusted backend explicitly requests it |
| Retrieval throttling | Optional per-token or per-caller rate limiting |
| Deterministic integrity | Stable token derivation and content hashing |

### What Core Does Not Guarantee

| Non-guarantee | Application responsibility |
|---|---|
| User authentication | Verify identity before calling Core |
| Authorization identity | Derive `userTier` from the authenticated session, never the request body |
| Database encryption | Use the database provider's encryption at rest |
| Cross-store atomicity | Use a transactional backend when strict atomicity is required |
| Tenant isolation | Use separate secrets and preferably separate Core instances per tenant |

## AI Agent Quick Read

- Read order: this README, then `src/index.ts`, then [../../demo/server.js](../../demo/server.js).
- Boundary: keep searchable records and private records separate.
- Token rule: retrieval stays backend-derived and opaque.
- Primary use: protect sensitive content while preserving discovery and search.

## Install

```bash
npm install koma-core
```

## Usage

```ts
import { createKomaStorage } from 'koma-core';

const storage = createKomaStorage({
  masterKey: process.env.KOMA_MASTER_KEY!, // at least 32 bytes
  indexDb,
  contentDb,
  enableAudit: true,
  auditLogger,
});

const written = await storage.writer.ingest({
  sourceId: 'doc-42',
  displayName: 'Meeting Notes',
  category: 'internal',
  tags: ['notes'],
  payload: { title: 'Meeting Notes', body: 'Confidential content' },
  accessTier: 'enterprise',
});

// Public-safe by default: no payload and no contentToken.
const hits = await storage.reader.search({ category: 'internal' });

// Resolve content only inside an authenticated backend route.
const detail = await storage.reader.fetchBySourceId('doc-42', 'enterprise');
```

## Main Exports

| Export | Purpose |
|---|---|
| `createKomaStorage()` | Creates the writer, reader, token deriver, and migrator |
| `DualCollectionWriter` | Writes index metadata and private payloads separately |
| `DualCollectionReader` | Searches safe metadata and performs authorized retrieval |
| `TokenDeriver` | Derives opaque HKDF tokens, optionally scoped to a user |
| `ContentHasher` | Produces deterministic payload hashes |
| `RateLimiter` | Applies retrieval limits with a pluggable storage backend |
| `DualCollectionMigrator` | Migrates legacy flat records into the split-store format |

## Design Rules

- Use a master key of at least 32 bytes and load it from KMS or a secret manager.
- Public search results never include content tokens by default.
- `includeTokens: true` is for trusted backend code only.
- Preview and full-content access enforce the stored access tier.
- Unknown access tiers fail closed.
- The returned ingestion token is a backend value; do not send it to untrusted clients.
