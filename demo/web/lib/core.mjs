/**
 * Koma Core demo — the real koma-core package with an in-memory adapter.
 *
 * Demonstrates the split-store boundary: search returns public index metadata
 * only (never content, never the content token); retrieving content requires the
 * correct access tier.
 *
 * Modern Cloudflare Workers compatibility dates expose the Node crypto APIs
 * used by koma-core, so this module is shared by Worker and Node deployments.
 */

import { createKomaStorage } from 'koma-core';

const DEMO_MASTER_KEY = 'koma-demo-master-key-change-me-in-production-00000000';

class InMemoryAdapter {
  constructor() {
    this.store = new Map();
  }

  #col(name) {
    let c = this.store.get(name);
    if (!c) {
      c = new Map();
      this.store.set(name, c);
    }
    return c;
  }

  async get(collection, id) {
    return this.#col(collection).get(id) ?? null;
  }

  async set(collection, id, data) {
    this.#col(collection).set(id, { ...data, id });
  }

  async batchSet(collection, docs) {
    const c = this.#col(collection);
    for (const d of docs) c.set(d.id, { ...d.data, id: d.id });
  }

  async query(collection, filters, limit) {
    let docs = [...this.#col(collection).values()];
    for (const f of filters) {
      docs = docs.filter((doc) => {
        const v = doc[f.field];
        switch (f.operator) {
          case '==':
            return v === f.value;
          case 'array-contains':
            return Array.isArray(v) && v.includes(f.value);
          default:
            return false;
        }
      });
    }
    return docs.slice(0, limit);
  }

  async delete(collection, id) {
    this.#col(collection).delete(id);
  }

  async increment(collection, id, field, value) {
    const c = this.#col(collection);
    const doc = c.get(id) ?? {};
    const next = (Number(doc[field]) || 0) + value;
    doc[field] = next;
    c.set(id, doc);
    return next;
  }
}

const storage = createKomaStorage({
  masterKey: DEMO_MASTER_KEY,
  indexDb: new InMemoryAdapter(),
  contentDb: new InMemoryAdapter(),
  hkdfInfo: 'koma-demo',
});

const DEMO_DOCS = [
  {
    sourceId: 'guide-getting-started',
    displayName: 'Getting Started Guide',
    category: 'docs',
    tags: ['guide', 'onboarding'],
    accessTier: 'public',
    payload: { title: 'Getting Started', body: 'Welcome! Install with npm install.' },
    metadata: { summary: 'Short onboarding guide', keyPoints: ['install', 'configure'] },
  },
  {
    sourceId: 'api-reference',
    displayName: 'API Reference',
    category: 'docs',
    tags: ['api', 'reference'],
    accessTier: 'premium',
    payload: { title: 'API Reference', body: 'GET /v1/items returns the full item list.' },
    metadata: { summary: 'Full API docs for premium customers', keyPoints: ['endpoints', 'auth'] },
  },
  {
    sourceId: 'internal-architecture',
    displayName: 'Internal Architecture',
    category: 'internal',
    tags: ['architecture', 'confidential'],
    accessTier: 'enterprise',
    payload: { title: 'Internal Architecture', body: 'Service topology, DB schemas, secrets layout.' },
    metadata: { summary: 'Confidential system architecture', keyPoints: ['topology', 'schemas'] },
  },
];

let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  for (const doc of DEMO_DOCS) {
    await storage.writer.ingest(doc);
  }
  seeded = true;
}

export async function searchDocs({ category, tag, limit } = {}) {
  const results = await storage.reader.search({
    category,
    tags: tag ? [tag] : undefined,
    limit: limit || 20,
  });
  return results.map((r) => ({
    indexId: r.indexId,
    displayName: r.displayName,
    category: r.category,
    tags: r.tags,
    accessTier: r.accessTier,
    preview: r.preview || null,
    hasContent: false, // search never returns content or tokens
  }));
}

export async function retrieveDoc(displayName, userTier) {
  // The backend resolves the user's selection to its own sourceId. The index
  // layer never exposes sourceId or the content token to clients — that mapping
  // stays server-side, which is the whole point of the split store.
  const doc = DEMO_DOCS.find((d) => d.displayName === displayName);
  if (!doc) {
    return { success: false, error: 'Document not found', errorCode: 'NOT_FOUND' };
  }
  const result = await storage.reader.fetchBySourceId(doc.sourceId, userTier);
  if (!result.success) {
    return { success: false, error: result.error, errorCode: result.errorCode };
  }
  return {
    success: true,
    sourceId: result.sourceId,
    accessTier: result.accessTier,
    payload: result.payload,
  };
}

/**
 * What happens when a scraper treats a scraped indexId as if it were the
 * content key. koma-core keys content by an opaque HKDF-derived token, so the
 * lookup fails — the indexId is NOT the content address.
 */
export async function attemptFetch(guessedId) {
  const result = await storage.reader.fetchContent(guessedId, { userTier: 'public' });
  return {
    success: result.success,
    error: result.error,
    errorCode: result.errorCode,
    attempted: guessedId,
  };
}
