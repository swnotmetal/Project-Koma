/**
 * Koma Core MCP Server
 *
 * Exposes Koma Core's protected RAG storage as MCP tools. Demonstrates the
 * "discovery ≠ authorization" boundary: agents can search the public index,
 * but retrieve private content only with the correct access tier.
 *
 * Environment:
 *   KOMA_MASTER_KEY — HKDF master key (default: demo key, do not use in production)
 */

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { createKomaStorage } from 'koma-core';
import { InMemoryDatabaseAdapter } from './in-memory-adapter.js';

const runtimeEnv = (globalThis as any).process?.env ?? {};

const DEMO_MASTER_KEY = 'koma-demo-master-key-change-me-in-production-00000000';
const masterKey = runtimeEnv.KOMA_MASTER_KEY || DEMO_MASTER_KEY;

const indexDb = new InMemoryDatabaseAdapter();
const contentDb = new InMemoryDatabaseAdapter();

const storage = createKomaStorage({
  masterKey,
  indexDb,
  contentDb,
  hkdfInfo: 'koma-core-mcp',
});

// Seed demo documents with different access tiers
const demoDocs = [
  {
    sourceId: 'guide-getting-started',
    displayName: 'Getting Started Guide',
    category: 'docs',
    tags: ['guide', 'onboarding'],
    accessTier: 'public' as const,
    payload: { title: 'Getting Started', body: 'Welcome to the product. Install with npm install.' },
    metadata: { summary: 'A short onboarding guide', keyPoints: ['install', 'configure'] },
  },
  {
    sourceId: 'api-reference',
    displayName: 'API Reference',
    category: 'docs',
    tags: ['api', 'reference'],
    accessTier: 'premium' as const,
    payload: { title: 'API Reference', body: 'Full endpoint documentation. GET /v1/items returns...' },
    metadata: { summary: 'Full API documentation for premium customers', keyPoints: ['endpoints', 'auth'] },
  },
  {
    sourceId: 'internal-architecture',
    displayName: 'Internal Architecture',
    category: 'internal',
    tags: ['architecture', 'confidential'],
    accessTier: 'enterprise' as const,
    payload: { title: 'Internal Architecture', body: 'Service topology, database schemas, and secrets layout.' },
    metadata: { summary: 'Confidential system architecture', keyPoints: ['topology', 'schemas'] },
  },
];

async function seed() {
  for (const doc of demoDocs) {
    await storage.writer.ingest(doc);
  }
}

const server = new McpServer({ name: 'koma-core', version: '0.1.0' });

server.registerTool(
  'search_docs',
  {
    description:
      'Search the public document index. Returns metadata (display name, category, tags, summary) — NOT the full content. ' +
      'Use retrieve_doc to read the actual content of a document you are authorized to access.',
    inputSchema: z.object({
      category: z.string().optional().describe('Filter by category (e.g. "docs", "internal")'),
      tag: z.string().optional().describe('Filter by tag (e.g. "api", "guide")'),
      limit: z.number().optional().describe('Maximum results to return. Default: 20'),
    }),
  },
  async ({ category, tag, limit }) => {
    const results = await storage.reader.search({
      category,
      tags: tag ? [tag] : undefined,
      limit: limit || 20,
    });
    const rows = results.map((r) => ({
      sourceId: r.indexId,
      displayName: r.displayName,
      category: r.category,
      tags: r.tags,
      accessTier: r.accessTier,
      preview: r.preview || null,
    }));
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }],
    };
  },
);

server.registerTool(
  'retrieve_doc',
  {
    description:
      'Retrieve the full content of a document by its source ID. Requires the user to have an access tier ' +
      'at or above the document\'s tier (public < premium < enterprise). Access is denied otherwise.',
    inputSchema: z.object({
      sourceId: z.string().describe('The document source ID (returned by search_docs)'),
      userTier: z
        .enum(['public', 'premium', 'enterprise'])
        .describe('The authenticated user\'s access tier'),
    }),
  },
  async ({ sourceId, userTier }) => {
    const result = await storage.reader.fetchBySourceId(sourceId, userTier);
    if (!result.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: result.error, errorCode: result.errorCode }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { success: true, sourceId: result.sourceId, accessTier: result.accessTier, payload: result.payload },
            null,
            2,
          ),
        },
      ],
    };
  },
);

async function main() {
  await seed();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const usingDemoKey = masterKey === DEMO_MASTER_KEY;
  console.error(
    `koma-core MCP server running (${usingDemoKey ? 'WARNING: using demo master key — set KOMA_MASTER_KEY in production' : 'custom master key'})`,
  );
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
