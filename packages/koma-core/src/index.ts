/**
 * Koma Core: anti-scraping dual-store routing architecture.
 *
 * Core design:
 * 1. DB_INDEX (public layer) stores only searchable index fields, display names, category tags, hashes, and opaque tokens
 * 2. DB_CONTENT (private layer) stores the full payload, with document IDs derived from HKDF(secret, source_id)
 * 3. Token mapping stays on the backend and is never exposed to the client
 * 4. Enumeration resistance: DB_CONTENT cannot be traversed without the exact token
 * 5. Audit trails, access tiers, and rate limiting
 */

import { EventEmitter } from 'events';
import { createHash, createHmac, randomBytes } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface StorageConfig {
  /** Master key for HKDF token derivation; production should source this from KMS or a secret manager. */
  masterKey: string | Buffer;
  /** Index-layer database adapter. */
  indexDb: DatabaseAdapter;
  /** Content-layer database adapter. */
  contentDb: DatabaseAdapter;
  /** HKDF info context for domain separation. */
  hkdfInfo?: string;
  /** Token length in bytes. */
  tokenLength?: number;
  /** Enable access auditing. */
  enableAudit?: boolean;
  /** Audit log adapter. */
  auditLogger?: AuditLogger;
}

export interface DatabaseAdapter {
  /** Fetch a single document. */
  get(collection: string, id: string): Promise<Document | null>;
  /** Write a document. */
  set(collection: string, id: string, data: Document): Promise<void>;
  /** Write multiple documents. */
  batchSet(collection: string, docs: Array<{ id: string; data: Document }>): Promise<void>;
  /** Query documents (index-layer only). */
  query(collection: string, filters: QueryFilter[], limit: number): Promise<Document[]>;
  /** Delete a document. */
  delete(collection: string, id: string): Promise<void>;
  /** Atomic increment used for access counting. */
  increment(collection: string, id: string, field: string, value: number): Promise<number>;
}

export interface Document {
  [key: string]: any;
  id?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'array-contains' | 'in';
  value: any;
}

export interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
}

export interface AuditEvent {
  type: 'READ_INDEX' | 'READ_CONTENT' | 'WRITE_INDEX' | 'WRITE_CONTENT' | 'TOKEN_GENERATED' | 'ACCESS_DENIED';
  userId?: string;
  ip?: string;
  token?: string;
  sourceId?: string;
  success: boolean;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface IndexDocument extends Document {
  /** Searchable display name. */
  displayName: string;
  /** Category tag used for filtering. */
  category: string;
  /** Tags array. */
  tags: string[];
  /** Content hash for integrity checks. */
  contentHash: string;
  /** Opaque token that points to DB_CONTENT. */
  contentToken: string;
  /** Safe metadata. */
  metadata: Record<string, any>;
  /** Version number. */
  version: number;
  /** Access tier. */
  accessTier: 'public' | 'premium' | 'enterprise';
}

export interface ContentDocument extends Document {
  /** Source identifier such as SPL_ID, ISBN, or DOI. */
  sourceId: string;
  /** Full content payload. */
  payload: any;
  /** Content token, which also serves as the document ID. */
  contentToken: string;
  /** Access tier. */
  accessTier: 'public' | 'premium' | 'enterprise';
  /** Access count. */
  accessCount: number;
  /** First access time. */
  firstAccessedAt?: number;
  /** Last access time. */
  lastAccessedAt?: number;
  /** Creator or source metadata. */
  provenance: {
    source: string;
    ingestedAt: number;
    ingestedBy: string;
    checksum: string;
  };
}

// ============================================================================
// Token Derivation (HKDF-based)
// ============================================================================

/**
 * Derive a content token from the master key using HKDF.
 * Guarantees:
 * 1. The token cannot be reversed back to sourceId
 * 2. The same sourceId always maps to the same token
 * 3. Different applications or tenants can isolate token spaces with different info contexts
 */
export class TokenDeriver {
  private masterKey: Buffer;
  private info: string;
  private tokenLength: number;

  constructor(masterKey: string | Buffer, info = 'koma-content-token', tokenLength = 32) {
    this.masterKey = Buffer.isBuffer(masterKey) ? masterKey : Buffer.from(masterKey, 'utf-8');
    this.info = info;
    this.tokenLength = tokenLength;
  }

  /**
   * Derive a content token.
   * @param sourceId Business identifier such as SPL_ID, SKU, or DOI.
   * @returns Token as a hexadecimal string.
   */
  derive(sourceId: string): string {
    // HKDF-Extract: PRK = HMAC-Hash(salt, IKM)
    // This implementation uses a fixed salt shape and the master key as IKM.
    const prk = createHmac('sha256', this.masterKey).update(sourceId).digest();
    
    // HKDF-Expand: T = HMAC-Hash(PRK, info || counter)
    const infoBuffer = Buffer.from(this.info + '\x01', 'utf-8');
    const expanded = createHmac('sha256', prk).update(infoBuffer).digest();
    
    return expanded.subarray(0, this.tokenLength).toString('hex');
  }

  /**
   * Verify that a token matches the given sourceId.
   * Intended for debugging and audit workflows only; do not expose in production APIs.
   */
  verify(token: string, sourceId: string): boolean {
    return this.derive(sourceId) === token;
  }

  /** Batch derive tokens. */
  deriveBatch(sourceIds: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const id of sourceIds) {
      result.set(id, this.derive(id));
    }
    return result;
  }
}

// ============================================================================
// Content Hasher
// ============================================================================

export class ContentHasher {
  static hash(payload: any): string {
    const normalized = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  static hashFields(payload: any, fields: string[]): string {
    const subset: Record<string, any> = {};
    for (const field of fields) {
      if (payload[field] !== undefined) subset[field] = payload[field];
    }
    return this.hash(subset);
  }
}

// ============================================================================
// Dual Collection Writer (Ingestion Pipeline)
// ============================================================================

export interface IngestionInput {
  /** Unique business source identifier. */
  sourceId: string;
  /** Display name. */
  displayName: string;
  /** Category. */
  category: string;
  /** Tags. */
  tags: string[];
  /** Full content payload. */
  payload: any;
  /** Metadata; only safe fields are allowed into the index layer. */
  metadata?: Record<string, any>;
  /** Access tier. */
  accessTier?: 'public' | 'premium' | 'enterprise';
  /** Source metadata. */
  provenance?: {
    source: string;
    ingestedBy: string;
  };
}

export interface IngestionResult {
  success: boolean;
  sourceId: string;
  indexId: string;
  contentToken: string;
  contentHash: string;
  errors: string[];
}

export class DualCollectionWriter {
  private indexDb: DatabaseAdapter;
  private contentDb: DatabaseAdapter;
  private tokenDeriver: TokenDeriver;
  private indexCollection: string;
  private contentCollection: string;
  private auditLogger?: AuditLogger;

  constructor(config: {
    indexDb: DatabaseAdapter;
    contentDb: DatabaseAdapter;
    tokenDeriver: TokenDeriver;
    indexCollection?: string;
    contentCollection?: string;
    auditLogger?: AuditLogger;
  }) {
    this.indexDb = config.indexDb;
    this.contentDb = config.contentDb;
    this.tokenDeriver = config.tokenDeriver;
    this.indexCollection = config.indexCollection || 'db_index_layer';
    this.contentCollection = config.contentCollection || 'db_content_layer';
    this.auditLogger = config.auditLogger;
  }

  /**
   * Write a single record.
   * Atomic intent: write content first, then write the index entry.
   */
  async ingest(input: IngestionInput): Promise<IngestionResult> {
    const errors: string[] = [];
    const now = Date.now();
    const contentToken = this.tokenDeriver.derive(input.sourceId);
    const contentHash = ContentHasher.hash(input.payload);
    const checksum = createHash('sha256').update(JSON.stringify(input.payload)).digest('hex');

    // 1. Prepare the content-layer document.
    const contentDoc: ContentDocument = {
      sourceId: input.sourceId,
      payload: input.payload,
      contentToken,
      accessTier: input.accessTier || 'public',
      accessCount: 0,
      provenance: {
        source: input.provenance?.source || 'unknown',
        ingestedAt: now,
        ingestedBy: input.provenance?.ingestedBy || 'system',
        checksum
      },
      createdAt: now,
      updatedAt: now
    };

    // 2. Prepare the index-layer document.
    // The index ID uses a readable slug and carries no sensitive data.
    const indexId = this.generateIndexId(input.displayName, input.category);
    
    const indexDoc: IndexDocument = {
      displayName: input.displayName,
      category: input.category,
      tags: input.tags,
      contentHash,
      contentToken,
      metadata: this.sanitizeMetadata(input.metadata || {}),
      version: 1,
      accessTier: input.accessTier || 'public',
      createdAt: now,
      updatedAt: now
    };

    try {
      // 3. Write the content layer first.
      await this.contentDb.set(this.contentCollection, contentToken, contentDoc);
      
      if (this.auditLogger) {
        await this.auditLogger.log({
          type: 'WRITE_CONTENT',
          sourceId: input.sourceId,
          token: contentToken,
          success: true,
          timestamp: now
        });
      }

      // 4. Write the index layer second.
      await this.indexDb.set(this.indexCollection, indexId, indexDoc);
      
      if (this.auditLogger) {
        await this.auditLogger.log({
          type: 'WRITE_INDEX',
          sourceId: input.sourceId,
          token: contentToken,
          success: true,
          timestamp: now
        });
      }

      return {
        success: true,
        sourceId: input.sourceId,
        indexId,
        contentToken,
        contentHash,
        errors: []
      };
    } catch (error) {
      const err = error as Error;
      errors.push(err.message);
      
      if (this.auditLogger) {
        await this.auditLogger.log({
          type: 'WRITE_CONTENT',
          sourceId: input.sourceId,
          token: contentToken,
          success: false,
          metadata: { error: err.message },
          timestamp: now
        });
      }
      
      // Attempt to roll back the content-layer write.
      try {
        await this.contentDb.delete(this.contentCollection, contentToken);
      } catch {}
      
      return {
        success: false,
        sourceId: input.sourceId,
        indexId: '',
        contentToken,
        contentHash,
        errors
      };
    }
  }

  /**
   * Write multiple records using batch operations.
   */
  async ingestBatch(inputs: IngestionInput[]): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    const contentBatch: Array<{ id: string; data: ContentDocument }> = [];
    const indexBatch: Array<{ id: string; data: IndexDocument }> = [];
    const now = Date.now();

    for (const input of inputs) {
      const contentToken = this.tokenDeriver.derive(input.sourceId);
      const contentHash = ContentHasher.hash(input.payload);
      const checksum = createHash('sha256').update(JSON.stringify(input.payload)).digest('hex');
      const indexId = this.generateIndexId(input.displayName, input.category);

      contentBatch.push({
        id: contentToken,
        data: {
          sourceId: input.sourceId,
          payload: input.payload,
          contentToken,
          accessTier: input.accessTier || 'public',
          accessCount: 0,
          provenance: {
            source: input.provenance?.source || 'unknown',
            ingestedAt: now,
            ingestedBy: input.provenance?.ingestedBy || 'system',
            checksum
          },
          createdAt: now,
          updatedAt: now
        }
      });

      indexBatch.push({
        id: indexId,
        data: {
          displayName: input.displayName,
          category: input.category,
          tags: input.tags,
          contentHash,
          contentToken,
          metadata: this.sanitizeMetadata(input.metadata || {}),
          version: 1,
          accessTier: input.accessTier || 'public',
          createdAt: now,
          updatedAt: now
        }
      });
    }

    try {
      await this.contentDb.batchSet(this.contentCollection, contentBatch);
      await this.indexDb.batchSet(this.indexCollection, indexBatch);
      
      for (let i = 0; i < inputs.length; i++) {
        results.push({
          success: true,
          sourceId: inputs[i].sourceId,
          indexId: indexBatch[i].id,
          contentToken: contentBatch[i].id,
          contentHash: ContentHasher.hash(inputs[i].payload),
          errors: []
        });
      }
    } catch (error) {
      const err = error as Error;
      for (const input of inputs) {
        results.push({
          success: false,
          sourceId: input.sourceId,
          indexId: '',
          contentToken: this.tokenDeriver.derive(input.sourceId),
          contentHash: ContentHasher.hash(input.payload),
          errors: [err.message]
        });
      }
    }

    return results;
  }

  /**
   * Update an existing record with version control and content-hash validation.
   */
  async update(sourceId: string, updates: Partial<IngestionInput>): Promise<IngestionResult> {
    const contentToken = this.tokenDeriver.derive(sourceId);
    const existingContent = await this.contentDb.get(this.contentCollection, contentToken);
    
    if (!existingContent) {
      return {
        success: false,
        sourceId,
        indexId: '',
        contentToken,
        contentHash: '',
        errors: ['Content not found']
      };
    }

    // Merge updates.
    const newPayload = updates.payload ? { ...existingContent.payload, ...updates.payload } : existingContent.payload;
    const newContentHash = ContentHasher.hash(newPayload);
    
    // Check whether the content actually changed.
    if (newContentHash === existingContent.contentHash && !updates.metadata && !updates.tags) {
      return {
        success: true,
        sourceId,
        indexId: '',
        contentToken,
        contentHash: newContentHash,
        errors: ['No changes detected']
      };
    }

    // Update the content layer.
    const updatedContent: ContentDocument = {
      ...existingContent,
      payload: newPayload,
      contentHash: newContentHash,
      updatedAt: Date.now(),
      provenance: {
        ...existingContent.provenance,
        checksum: createHash('sha256').update(JSON.stringify(newPayload)).digest('hex')
      }
    };

    await this.contentDb.set(this.contentCollection, contentToken, updatedContent);

    // Update the index layer if needed.
    if (updates.displayName || updates.category || updates.tags || updates.metadata) {
      // Resolve the index document by contentToken.
      const indexDocs = await this.indexDb.query(this.indexCollection, [
        { field: 'contentToken', operator: '==', value: contentToken }
      ], 1);
      
      if (indexDocs.length > 0) {
        const indexDoc = indexDocs[0];
        const updatedIndex: IndexDocument = {
          ...indexDoc,
          displayName: updates.displayName || indexDoc.displayName,
          category: updates.category || indexDoc.category,
          tags: updates.tags || indexDoc.tags,
          contentHash: newContentHash,
          metadata: updates.metadata ? this.sanitizeMetadata({ ...indexDoc.metadata, ...updates.metadata }) : indexDoc.metadata,
          version: (indexDoc.version || 0) + 1,
          updatedAt: Date.now()
        };
        await this.indexDb.set(this.indexCollection, indexDoc.id, updatedIndex);
      }
    }

    return {
      success: true,
      sourceId,
      indexId: '',
      contentToken,
      contentHash: newContentHash,
      errors: []
    };
  }

  private generateIndexId(displayName: string, category: string): string {
    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
    const catSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${slug}-${catSlug}-${randomBytes(4).toString('hex')}`;
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    // Allow only safe fields into the index layer.
    const allowedKeys = ['version', 'format', 'language', 'region', 'tags', 'attributes'];
    const sanitized: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (metadata[key] !== undefined) sanitized[key] = metadata[key];
    }
    return sanitized;
  }
}

// ============================================================================
// Dual Collection Reader (Query Execution)
// ============================================================================

export interface SearchOptions {
  query?: string;
  category?: string;
  tags?: string[];
  accessTier?: 'public' | 'premium' | 'enterprise';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  indexId: string;
  displayName: string;
  category: string;
  tags: string[];
  contentToken: string;
  accessTier: string;
  metadata: Record<string, any>;
  // Content preview (optional, public fields only).
  preview?: Record<string, any>;
}

export interface ContentFetchOptions {
  /** User access tier. */
  userTier: 'public' | 'premium' | 'enterprise';
  /** Rate-limit key. */
  rateLimitKey?: string;
  /** Maximum allowed access count. */
  maxAccessCount?: number;
}

export interface ContentFetchResult {
  success: boolean;
  payload?: any;
  sourceId?: string;
  accessTier?: string;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'ACCESS_DENIED' | 'RATE_LIMITED' | 'INVALID_TOKEN';
}

export class DualCollectionReader {
  private indexDb: DatabaseAdapter;
  private contentDb: DatabaseAdapter;
  private tokenDeriver: TokenDeriver;
  private indexCollection: string;
  private contentCollection: string;
  private auditLogger?: AuditLogger;
  private rateLimiter?: RateLimiter;

  constructor(config: {
    indexDb: DatabaseAdapter;
    contentDb: DatabaseAdapter;
    tokenDeriver: TokenDeriver;
    indexCollection?: string;
    contentCollection?: string;
    auditLogger?: AuditLogger;
    rateLimiter?: RateLimiter;
  }) {
    this.indexDb = config.indexDb;
    this.contentDb = config.contentDb;
    this.tokenDeriver = config.tokenDeriver;
    this.indexCollection = config.indexCollection || 'db_index_layer';
    this.contentCollection = config.contentCollection || 'db_content_layer';
    this.auditLogger = config.auditLogger;
    this.rateLimiter = config.rateLimiter;
  }

  /**
   * Search the index layer.
   * Returns lightweight results plus the content token.
   */
  async search(options: SearchOptions = {}): Promise<SearchResult[]> {
    const filters: QueryFilter[] = [];
    const limit = options.limit || 20;

    if (options.category) {
      filters.push({ field: 'category', operator: '==', value: options.category });
    }
    if (options.tags && options.tags.length > 0) {
      filters.push({ field: 'tags', operator: 'array-contains', value: options.tags[0] });
    }
    if (options.accessTier) {
      filters.push({ field: 'accessTier', operator: '==', value: options.accessTier });
    }

    // Text search requires database support such as Algolia, MeiliSearch, or Firestore array-contains.
    // This demo keeps the search step intentionally simple.
    const docs = await this.indexDb.query(this.indexCollection, filters, limit);

    return docs.map(doc => ({
      indexId: doc.id,
      displayName: doc.displayName,
      category: doc.category,
      tags: doc.tags,
      contentToken: doc.contentToken,
      accessTier: doc.accessTier,
      metadata: doc.metadata,
      preview: this.extractPreview(doc.metadata)
    }));
  }

  /**
   * Fetch full content by contentToken with authorization checks.
   * This is the only supported way to access DB_CONTENT.
   */
  async fetchContent(
    contentToken: string, 
    options: ContentFetchOptions
  ): Promise<ContentFetchResult> {
    const now = Date.now();

    // 1. Rate limit check.
    if (this.rateLimiter && options.rateLimitKey) {
      const allowed = await this.rateLimiter.check(options.rateLimitKey, options.maxAccessCount || 100);
      if (!allowed) {
        await this.auditLog('READ_CONTENT', { token: contentToken, success: false, error: 'RATE_LIMITED' });
        return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMITED' };
      }
    }

    // 2. Fetch the content document.
    const contentDoc = await this.contentDb.get(this.contentCollection, contentToken);
    
    if (!contentDoc) {
      await this.auditLog('READ_CONTENT', { token: contentToken, success: false, error: 'NOT_FOUND' });
      return { success: false, error: 'Content not found', errorCode: 'NOT_FOUND' };
    }

    // 3. Enforce access tier checks.
    if (!this.canAccess(options.userTier, contentDoc.accessTier)) {
      await this.auditLog('READ_CONTENT', { 
        token: contentToken, 
        success: false, 
        error: 'ACCESS_DENIED',
        metadata: { required: contentDoc.accessTier, user: options.userTier }
      });
      return { 
        success: false, 
        error: `Requires ${contentDoc.accessTier} tier`, 
        errorCode: 'ACCESS_DENIED' 
      };
    }

    // 4. Update access statistics asynchronously.
    this.updateAccessStats(contentToken).catch(console.error);

    // 5. Write the audit log.
    await this.auditLog('READ_CONTENT', { 
      token: contentToken, 
      sourceId: contentDoc.sourceId, 
      success: true 
    });

    return {
      success: true,
      payload: contentDoc.payload,
      sourceId: contentDoc.sourceId,
      accessTier: contentDoc.accessTier
    };
  }

  /**
   * Fetch content directly by sourceId for internal or administrative use.
   */
  async fetchBySourceId(sourceId: string, userTier: 'public' | 'premium' | 'enterprise'): Promise<ContentFetchResult> {
    const contentToken = this.tokenDeriver.derive(sourceId);
    return this.fetchContent(contentToken, { userTier });
  }

  /**
   * Get a content preview without incrementing the access count.
   */
  async getPreview(contentToken: string): Promise<Record<string, any> | null> {
    const contentDoc = await this.contentDb.get(this.contentCollection, contentToken);
    if (!contentDoc) return null;
    
    // Return only safe preview fields.
    return this.extractPreview(contentDoc.payload);
  }

  private canAccess(userTier: string, requiredTier: string): boolean {
    const tiers = { public: 0, premium: 1, enterprise: 2 };
    return (tiers[userTier as keyof typeof tiers] || 0) >= (tiers[requiredTier as keyof typeof tiers] || 0);
  }

  private async updateAccessStats(contentToken: string): Promise<void> {
    const now = Date.now();
    await this.contentDb.increment(this.contentCollection, contentToken, 'accessCount', 1);
    await this.contentDb.increment(this.contentCollection, contentToken, 'lastAccessedAt', now);
    // Set firstAccessedAt only once.
    const doc = await this.contentDb.get(this.contentCollection, contentToken);
    if (doc && !doc.firstAccessedAt) {
      await this.contentDb.set(this.contentCollection, contentToken, { ...doc, firstAccessedAt: now });
    }
  }

  private extractPreview(payload: any): Record<string, any> {
    // Extract only safe preview fields.
    const previewFields = ['summary', 'description', 'excerpt', 'thumbnail', 'keyPoints'];
    const preview: Record<string, any> = {};
    for (const field of previewFields) {
      if (payload[field] !== undefined) preview[field] = payload[field];
    }
    return preview;
  }

  private async auditLog(type: AuditEvent['type'], data: Partial<AuditEvent>): Promise<void> {
    if (this.auditLogger) {
      await this.auditLogger.log({ type, ...data, timestamp: Date.now() } as AuditEvent);
    }
  }
}

// ============================================================================
// Rate Limiter (Per-Token / Per-User)
// ============================================================================

export interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  storage: CounterRateLimitStorage;
}

export interface CounterRateLimitStorage {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export class RateLimiter {
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  async check(key: string, maxRequests?: number): Promise<boolean> {
    const limit = maxRequests || this.config.maxRequests;
    const result = await this.config.storage.increment(key, this.config.windowMs);
    return result.count <= limit;
  }

  async getRemaining(key: string): Promise<number> {
    const result = await this.config.storage.increment(key, this.config.windowMs);
    return Math.max(0, this.config.maxRequests - result.count);
  }
}

// In-memory rate limit storage for development.
export class MemoryRateLimitStorage implements CounterRateLimitStorage {
  private store = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.store.get(key);
    
    if (!entry || now > entry.resetAt) {
      const newEntry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, newEntry);
      return newEntry;
    }
    
    entry.count++;
    this.store.set(key, entry);
    return entry;
  }
}

// ============================================================================
// Migration Utility (Legacy -> Dual Collection)
// ============================================================================

export interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ sourceId: string; error: string }>;
}

export class DualCollectionMigrator {
  private writer: DualCollectionWriter;
  private legacyDb: DatabaseAdapter;
  private legacyCollection: string;
  private sourceIdField: string;

  constructor(config: {
    writer: DualCollectionWriter;
    legacyDb: DatabaseAdapter;
    legacyCollection: string;
    sourceIdField: string;
  }) {
    this.writer = config.writer;
    this.legacyDb = config.legacyDb;
    this.legacyCollection = config.legacyCollection;
    this.sourceIdField = config.sourceIdField;
  }

  async migrate(batchSize = 100): Promise<MigrationStats> {
    const stats: MigrationStats = { total: 0, migrated: 0, skipped: 0, errors: [] };
    
    // Simplified for the demo; production code should use cursor-based pagination.
    const docs = await this.legacyDb.query(this.legacyCollection, [], 10000);
    
    for (const doc of docs) {
      stats.total++;
      const sourceId = doc[this.sourceIdField];
      
      if (!sourceId) {
        stats.skipped++;
        stats.errors.push({ sourceId: doc.id || 'unknown', error: `Missing ${this.sourceIdField}` });
        continue;
      }

      try {
        const result = await this.writer.ingest({
          sourceId,
          displayName: doc.displayName || doc.name || sourceId,
          category: doc.category || 'general',
          tags: doc.tags || [],
          payload: doc,
          metadata: doc.metadata,
          accessTier: doc.accessTier,
          provenance: { source: 'legacy-migration', ingestedBy: 'migrator' }
        });

        if (result.success) {
          stats.migrated++;
        } else {
          stats.errors.push({ sourceId, error: result.errors.join(', ') });
        }
      } catch (error) {
        stats.errors.push({ sourceId, error: (error as Error).message });
      }
    }

    return stats;
  }
}

// ============================================================================
// Factory & Presets
// ============================================================================

export function createVibeShieldStorage(config: StorageConfig) {
  const tokenDeriver = new TokenDeriver(config.masterKey, config.hkdfInfo, config.tokenLength);
  
  const writer = new DualCollectionWriter({
    indexDb: config.indexDb,
    contentDb: config.contentDb,
    tokenDeriver,
    auditLogger: config.auditLogger
  });

  const reader = new DualCollectionReader({
    indexDb: config.indexDb,
    contentDb: config.contentDb,
    tokenDeriver,
    auditLogger: config.auditLogger,
    rateLimiter: config.enableAudit ? new RateLimiter({
      windowMs: 60000,
      maxRequests: 100,
      storage: new MemoryRateLimitStorage()
    }) : undefined
  });

  return {
    writer,
    reader,
    tokenDeriver,
    migrator: new DualCollectionMigrator({
      writer,
      legacyDb: config.indexDb, // Assuming same DB for legacy
      legacyCollection: 'legacy_collection',
      sourceIdField: 'sourceId'
    })
  };
}

export default {
  TokenDeriver,
  ContentHasher,
  DualCollectionWriter,
  DualCollectionReader,
  RateLimiter,
  MemoryRateLimitStorage,
  DualCollectionMigrator,
  createVibeShieldStorage
};