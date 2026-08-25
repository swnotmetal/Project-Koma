/**
 * Koma Core unit tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TokenDeriver,
  ContentHasher,
  DualCollectionWriter,
  DualCollectionReader,
  RateLimiter,
  MemoryRateLimitStorage,
  DualCollectionMigrator,
  createKomaStorage,
} from './index';
import type { DatabaseAdapter, Document, QueryFilter } from './index';

// ---------------------------------------------------------------------------
// In-memory database adapter for testing
// ---------------------------------------------------------------------------

class InMemoryDb implements DatabaseAdapter {
  private store = new Map<string, Map<string, Document>>();

  private ensureCollection(name: string): Map<string, Document> {
    if (!this.store.has(name)) this.store.set(name, new Map());
    return this.store.get(name)!;
  }

  async get(collection: string, id: string): Promise<Document | null> {
    return this.ensureCollection(collection).get(id) ?? null;
  }

  async set(collection: string, id: string, data: Document): Promise<void> {
    this.ensureCollection(collection).set(id, { ...data, id });
  }

  async batchSet(collection: string, docs: Array<{ id: string; data: Document }>): Promise<void> {
    const col = this.ensureCollection(collection);
    for (const { id, data } of docs) col.set(id, { ...data, id });
  }

  async query(collection: string, filters: QueryFilter[], limit: number): Promise<Document[]> {
    const col = this.ensureCollection(collection);
    let results = [...col.values()];

    for (const f of filters) {
      if (f.operator === '==') {
        results = results.filter((d) => d[f.field] === f.value);
      } else if (f.operator === 'array-contains') {
        results = results.filter((d) => Array.isArray(d[f.field]) && d[f.field].includes(f.value));
      }
    }

    return results.slice(0, limit);
  }

  async delete(collection: string, id: string): Promise<void> {
    this.ensureCollection(collection).delete(id);
  }

  async increment(collection: string, id: string, field: string, value: number): Promise<number> {
    const doc = await this.get(collection, id);
    if (!doc) return value;
    const current = (doc[field] as number) || 0;
    const updated = current + value;
    doc[field] = updated;
    await this.set(collection, id, doc);
    return updated;
  }
}

// ---------------------------------------------------------------------------
// TokenDeriver
// ---------------------------------------------------------------------------

describe('TokenDeriver', () => {
  const masterKey = Buffer.alloc(32, 0x41);
  const deriver = new TokenDeriver(masterKey, 'koma-test', 32);

  it('should derive deterministic tokens', () => {
    const t1 = deriver.derive('doc-1');
    const t2 = deriver.derive('doc-1');
    expect(t1).toBe(t2);
  });

  it('should produce different tokens for different sourceIds', () => {
    const t1 = deriver.derive('doc-1');
    const t2 = deriver.derive('doc-2');
    expect(t1).not.toBe(t2);
  });

  it('should produce hex strings of correct length', () => {
    const token = deriver.derive('some-id');
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should verify matching tokens', () => {
    expect(deriver.verify(deriver.derive('abc'), 'abc')).toBe(true);
  });

  it('should reject non-matching tokens', () => {
    expect(deriver.verify(deriver.derive('abc'), 'xyz')).toBe(false);
  });

  it('should batch derive', () => {
    const ids = ['a', 'b', 'c'];
    const map = deriver.deriveBatch(ids);
    expect(map.size).toBe(3);
    for (const id of ids) {
      expect(map.get(id)).toBe(deriver.derive(id));
    }
  });

  it('should produce different tokens with different info contexts', () => {
    const d1 = new TokenDeriver(masterKey, 'context-a', 32);
    const d2 = new TokenDeriver(masterKey, 'context-b', 32);
    expect(d1.derive('same-id')).not.toBe(d2.derive('same-id'));
  });

  it('should accept Buffer masterKey', () => {
    const d = new TokenDeriver(Buffer.alloc(32, 0x42));
    const token = d.derive('test');
    expect(token).toHaveLength(64);
  });

  it('should derive with custom token length', () => {
    const d = new TokenDeriver(masterKey, 'test', 16);
    expect(d.derive('x')).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});

// ---------------------------------------------------------------------------
// ContentHasher
// ---------------------------------------------------------------------------

describe('ContentHasher', () => {
  it('should hash content deterministically', () => {
    const h1 = ContentHasher.hash({ a: 1, b: 2 });
    const h2 = ContentHasher.hash({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it('should produce different hashes for different content', () => {
    const h1 = ContentHasher.hash({ a: 1 });
    const h2 = ContentHasher.hash({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it('should hash only specified fields', () => {
    const h1 = ContentHasher.hashFields({ a: 1, b: 2, c: 3 }, ['a', 'b']);
    const h2 = ContentHasher.hashFields({ a: 1, b: 2, c: 999 }, ['a', 'b']);
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// DualCollectionWriter + DualCollectionReader
// ---------------------------------------------------------------------------

describe('DualCollectionWriter', () => {
  let indexDb: InMemoryDb;
  let contentDb: InMemoryDb;
  let tokenDeriver: TokenDeriver;
  let writer: DualCollectionWriter;

  beforeEach(() => {
    indexDb = new InMemoryDb();
    contentDb = new InMemoryDb();
    tokenDeriver = new TokenDeriver(Buffer.alloc(32, 0x43));
    writer = new DualCollectionWriter({
      indexDb,
      contentDb,
      tokenDeriver,
    });
  });

  it('should ingest a single record into both layers', async () => {
    const result = await writer.ingest({
      sourceId: 'doc-001',
      displayName: 'Test Document',
      category: 'docs',
      tags: ['test', 'demo'],
      payload: { title: 'Hello', body: 'World' },
    });

    expect(result.success).toBe(true);
    expect(result.sourceId).toBe('doc-001');
    expect(result.contentToken).toBe(tokenDeriver.derive('doc-001'));
    expect(result.errors).toEqual([]);
  });

  it('should store index and content separately', async () => {
    await writer.ingest({
      sourceId: 'split-test',
      displayName: 'Split Doc',
      category: 'test',
      tags: [],
      payload: { secret: 'data' },
    });

    const contentToken = tokenDeriver.derive('split-test');

    // Content store has the payload
    const content = await contentDb.get('db_content_layer', contentToken);
    expect(content).not.toBeNull();
    expect(content!.payload).toEqual({ secret: 'data' });

    // Index store does NOT have the payload — only metadata
    const indexDocs = await indexDb.query('db_index_layer', [], 10);
    expect(indexDocs.length).toBe(1);
    expect(indexDocs[0].payload).toBeUndefined();
    expect(indexDocs[0].displayName).toBe('Split Doc');
  });

  it('should sanitize metadata to only allowed keys', async () => {
    await writer.ingest({
      sourceId: 'meta-test',
      displayName: 'Meta Doc',
      category: 'test',
      tags: [],
      payload: {},
      metadata: { version: 2, language: 'zh', secretKey: 'leaked', password: '123' },
    });

    const indexDocs = await indexDb.query('db_index_layer', [], 10);
    expect(indexDocs[0].metadata).toEqual({ version: 2, language: 'zh' });
    expect(indexDocs[0].metadata.secretKey).toBeUndefined();
  });

  it('should roll back content write on index write failure', async () => {
    // Make indexDb.set throw on its first call (which is the index write,
    // since contentDb.set is called first by the writer).
    const origSet = indexDb.set.bind(indexDb);
    indexDb.set = async (col, id, data) => {
      // The writer calls contentDb.set first, then indexDb.set.
      // This is the indexDb.set call → throw immediately.
      throw new Error('Index write failed');
    };

    const result = await writer.ingest({
      sourceId: 'rollback-test',
      displayName: 'Rollback',
      category: 'test',
      tags: [],
      payload: { x: 1 },
    });

    expect(result.success).toBe(false);
    // Content should have been rolled back
    const contentToken = tokenDeriver.derive('rollback-test');
    const content = await contentDb.get('db_content_layer', contentToken);
    expect(content).toBeNull();
  });

  it('should ingest a batch of records', async () => {
    const results = await writer.ingestBatch([
      { sourceId: 'batch-1', displayName: 'B1', category: 'cat', tags: [], payload: { n: 1 } },
      { sourceId: 'batch-2', displayName: 'B2', category: 'cat', tags: [], payload: { n: 2 } },
      { sourceId: 'batch-3', displayName: 'B3', category: 'cat', tags: [], payload: { n: 3 } },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);

    const indexDocs = await indexDb.query('db_index_layer', [], 10);
    expect(indexDocs).toHaveLength(3);
  });

  it('should generate unique index IDs', async () => {
    const r1 = await writer.ingest({
      sourceId: 'id-1', displayName: 'Same Name', category: 'same', tags: [], payload: {},
    });
    const r2 = await writer.ingest({
      sourceId: 'id-2', displayName: 'Same Name', category: 'same', tags: [], payload: {},
    });

    expect(r1.indexId).not.toBe(r2.indexId);
  });
});

// ---------------------------------------------------------------------------
// DualCollectionReader
// ---------------------------------------------------------------------------

describe('DualCollectionReader', () => {
  let indexDb: InMemoryDb;
  let contentDb: InMemoryDb;
  let tokenDeriver: TokenDeriver;
  let writer: DualCollectionWriter;
  let reader: DualCollectionReader;

  beforeEach(async () => {
    indexDb = new InMemoryDb();
    contentDb = new InMemoryDb();
    tokenDeriver = new TokenDeriver(Buffer.alloc(32, 0x44));
    writer = new DualCollectionWriter({ indexDb, contentDb, tokenDeriver });
    reader = new DualCollectionReader({ indexDb, contentDb, tokenDeriver });

    // Seed test data
    await writer.ingest({
      sourceId: 'public-doc',
      displayName: 'Public Article',
      category: 'articles',
      tags: ['tech'],
      payload: { summary: 'A public article', body: 'Full content here' },
      accessTier: 'public',
    });

    await writer.ingest({
      sourceId: 'premium-doc',
      displayName: 'Premium Article',
      category: 'articles',
      tags: ['premium'],
      payload: { summary: 'A premium article', body: 'Premium content' },
      accessTier: 'premium',
    });
  });

  it('should search by category', async () => {
    const results = await reader.search({ category: 'articles' });
    expect(results).toHaveLength(2);
  });

  it('should search by tag', async () => {
    const results = await reader.search({ tags: ['tech'] });
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Public Article');
  });

  it('should return public index results without payload or content token', async () => {
    const results = await reader.search();
    for (const r of results) {
      expect(r.payload).toBeUndefined();
      expect((r as any).contentToken).toBeUndefined();
    }
  });

  it('should return content tokens only when explicitly requested by a backend caller', async () => {
    const results = await reader.search({ includeTokens: true });
    for (const r of results) {
      expect((r as any).contentToken).toBeTruthy();
    }
  });

  it('should fetch content by token', async () => {
    const contentToken = tokenDeriver.derive('public-doc');
    const result = await reader.fetchContent(contentToken, { userTier: 'public' });

    expect(result.success).toBe(true);
    expect(result.payload).toEqual({ summary: 'A public article', body: 'Full content here' });
  });

  it('should deny access when tier is too low', async () => {
    const contentToken = tokenDeriver.derive('premium-doc');
    const result = await reader.fetchContent(contentToken, { userTier: 'public' });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ACCESS_DENIED');
  });

  it('should allow access when tier matches or exceeds', async () => {
    const contentToken = tokenDeriver.derive('premium-doc');

    const premiumResult = await reader.fetchContent(contentToken, { userTier: 'premium' });
    expect(premiumResult.success).toBe(true);

    const enterpriseResult = await reader.fetchContent(contentToken, { userTier: 'enterprise' });
    expect(enterpriseResult.success).toBe(true);
  });

  it('should return NOT_FOUND for unknown tokens', async () => {
    const result = await reader.fetchContent('nonexistent-token', { userTier: 'public' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('should fetch by sourceId (internal API)', async () => {
    const result = await reader.fetchBySourceId('public-doc', 'public');
    expect(result.success).toBe(true);
    expect(result.sourceId).toBe('public-doc');
  });
});

// ---------------------------------------------------------------------------
// RateLimiter (koma-core version)
// ---------------------------------------------------------------------------

describe('RateLimiter (core)', () => {
  it('should allow requests within the limit', async () => {
    const storage = new MemoryRateLimitStorage();
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 3, storage });

    expect(await limiter.check('key1')).toBe(true);
    expect(await limiter.check('key1')).toBe(true);
    expect(await limiter.check('key1')).toBe(true);
  });

  it('should block requests exceeding the limit', async () => {
    const storage = new MemoryRateLimitStorage();
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2, storage });

    await limiter.check('key2');
    await limiter.check('key2');
    await limiter.check('key2');
    expect(await limiter.check('key2')).toBe(false);
  });

  it('should return remaining count', async () => {
    const storage = new MemoryRateLimitStorage();
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5, storage });

    // check() increments, so after 1 check: count=1, remaining = 5-1 = 4
    expect(await limiter.check('key3')).toBe(true);
    // getRemaining() also increments internally: count=2, remaining = 5-2 = 3
    expect(await limiter.getRemaining('key3')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// createKomaStorage factory
// ---------------------------------------------------------------------------

describe('createKomaStorage', () => {
  it('should create a complete storage instance', () => {
    const indexDb = new InMemoryDb();
    const contentDb = new InMemoryDb();

    const storage = createKomaStorage({
      masterKey: Buffer.alloc(32, 0x45),
      indexDb,
      contentDb,
    });

    expect(storage.writer).toBeInstanceOf(DualCollectionWriter);
    expect(storage.reader).toBeInstanceOf(DualCollectionReader);
    expect(storage.tokenDeriver).toBeInstanceOf(TokenDeriver);
    expect(storage.migrator).toBeInstanceOf(DualCollectionMigrator);
  });

  it('should work end-to-end: write then read', async () => {
    const indexDb = new InMemoryDb();
    const contentDb = new InMemoryDb();

    const storage = createKomaStorage({
      masterKey: Buffer.alloc(32, 0x46),
      indexDb,
      contentDb,
    });

    const ingestResult = await storage.writer.ingest({
      sourceId: 'e2e-doc',
      displayName: 'E2E Document',
      category: 'e2e',
      tags: ['integration'],
      payload: { title: 'End-to-End', data: [1, 2, 3] },
      accessTier: 'public',
    });

    expect(ingestResult.success).toBe(true);

    const searchResults = await storage.reader.search({ category: 'e2e' });
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].displayName).toBe('E2E Document');

    const content = await storage.reader.fetchContent(ingestResult.contentToken, { userTier: 'public' });
    expect(content.success).toBe(true);
    expect(content.payload).toEqual({ title: 'End-to-End', data: [1, 2, 3] });
  });
});
