/**
 * In-memory DatabaseAdapter for Koma Core.
 *
 * Reference implementation only — zero dependencies, no persistence.
 * For production, implement the same DatabaseAdapter interface against
 * Firestore, MongoDB, or any real database.
 */

import type { DatabaseAdapter, Document, QueryFilter } from 'koma-core';

export class InMemoryDatabaseAdapter implements DatabaseAdapter {
  private store = new Map<string, Map<string, Document>>();

  private collection(name: string): Map<string, Document> {
    let col = this.store.get(name);
    if (!col) {
      col = new Map();
      this.store.set(name, col);
    }
    return col;
  }

  async get(collection: string, id: string): Promise<Document | null> {
    return this.collection(collection).get(id) ?? null;
  }

  async set(collection: string, id: string, data: Document): Promise<void> {
    this.collection(collection).set(id, { ...data, id });
  }

  async batchSet(collection: string, docs: Array<{ id: string; data: Document }>): Promise<void> {
    const col = this.collection(collection);
    for (const doc of docs) {
      col.set(doc.id, { ...doc.data, id: doc.id });
    }
  }

  async query(collection: string, filters: QueryFilter[], limit: number): Promise<Document[]> {
    let docs = [...this.collection(collection).values()];

    for (const filter of filters) {
      docs = docs.filter((doc) => this.matches(doc, filter));
    }

    return docs.slice(0, limit);
  }

  async delete(collection: string, id: string): Promise<void> {
    this.collection(collection).delete(id);
  }

  async increment(collection: string, id: string, field: string, value: number): Promise<number> {
    const col = this.collection(collection);
    const doc = col.get(id) ?? {};
    const next = ((doc[field] as number) ?? 0) + value;
    doc[field] = next;
    col.set(id, doc);
    return next;
  }

  private matches(doc: Document, filter: QueryFilter): boolean {
    const value = doc[filter.field];
    switch (filter.operator) {
      case '==':
        return value === filter.value;
      case '!=':
        return value !== filter.value;
      case '>':
        return (value as number) > (filter.value as number);
      case '>=':
        return (value as number) >= (filter.value as number);
      case '<':
        return (value as number) < (filter.value as number);
      case '<=':
        return (value as number) <= (filter.value as number);
      case 'array-contains':
        return Array.isArray(value) && value.includes(filter.value);
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      default:
        return false;
    }
  }
}
