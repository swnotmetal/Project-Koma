/**
 * Koma Core example: protected RAG storage.
 * 
 * Run:  node examples/rag-storage.js
 * 
 * Scenario (2025-2027): You built a RAG system that stores AI-generated meeting
 * summaries. Without Core, the index and content live in the same collection —
 * meaning anyone who can search can also read confidential details. Core splits
 * the two and links them with opaque backend-derived tokens.
 */

const crypto = require('crypto');

// Simulate Koma Core (in production, import from 'koma-core')
function createStorage(masterKey) {
  const indexStore = new Map();
  const contentStore = new Map();

  function deriveToken(sourceId) {
    return crypto.createHmac('sha256', masterKey).update(sourceId).digest('hex').slice(0, 32);
  }

  return {
    ingest({ sourceId, displayName, category, payload }) {
      const token = deriveToken(sourceId);

      // Public index: searchable, lightweight, no confidential data
      indexStore.set(sourceId, {
        displayName,
        category,
        contentToken: token,
        createdAt: Date.now(),
      });

      // Private content: addressed by token only, not listable
      contentStore.set(token, {
        sourceId,
        payload,
        accessCount: 0,
      });

      return { success: true, indexId: sourceId, contentToken: token };
    },

    search(query) {
      const q = query.toLowerCase();
      const results = [];
      for (const [id, doc] of indexStore) {
        if (doc.displayName.toLowerCase().includes(q) || doc.category.toLowerCase().includes(q)) {
          results.push({ indexId: id, ...doc });
        }
      }
      return results;
    },

    getContent(token) {
      const entry = contentStore.get(token);
      if (!entry) return null;
      entry.accessCount++;
      return entry;
    },
  };
}

console.log('=== Koma Core: RAG Storage Demo ===\n');

const storage = createStorage('demo-master-key');

// Ingest three AI-generated meeting summaries
const meetings = [
  { sourceId: 'mtg-001', displayName: 'Q1 Strategy Review', category: 'executive', payload: 'Confidential: Board approved $50M Series B at $400M valuation.' },
  { sourceId: 'mtg-002', displayName: 'Engineering Standup', category: 'engineering', payload: 'Sprint retro: 42 points completed, 8 carryover. On track for July launch.' },
  { sourceId: 'mtg-003', displayName: 'HR Policy Update', category: 'hr', payload: 'Confidential: New compensation bands approved for L5-L7 engineers.' },
];

for (const m of meetings) {
  const result = storage.ingest(m);
  console.log(`📥 Ingested: "${m.displayName}" → token: ${result.contentToken}`);
}

// Search the public index
console.log('\n🔍 Search: "strategy"');
const results = storage.search('strategy');
for (const r of results) {
  console.log(`   Found: "${r.displayName}" (${r.category}) — token: ${r.contentToken}`);
  console.log('   ⚠️  Index shows metadata only. Content is behind the token.');
}

// Fetch content by token (requires knowing the exact token)
console.log('\n🔑 Get content for token of "HR Policy Update":');
const detail = storage.getContent(storage.ingest(meetings[2]).contentToken);
console.log(`   Content: ${detail.payload}`);

console.log('\n💡 Without Core, the search above would have returned the full');
console.log('   confidential text to anyone who could type "strategy".');
console.log('\nReal use:   import { createKomaStorage } from \'koma-core\';');
console.log('           const storage = createKomaStorage({ masterKey, indexDb, contentDb });');
