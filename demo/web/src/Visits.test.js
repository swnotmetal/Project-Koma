import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const script = readFileSync(new URL('../public/visits.js', import.meta.url), 'utf8');

function page(storage = new Map()) {
  const elements = { 'visit-count': { textContent: '' }, 'visit-counter': { hidden: true } };
  const context = {
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    document: { getElementById: (id) => elements[id] },
    fetch: vi.fn(async () => ({ ok: true, json: async () => ({ count: 42 }) })),
  };
  return { context, elements, run: () => runInNewContext(script, context) };
}

describe('demo visit count', () => {
  it('counts the first load and only reads on refresh', async () => {
    const storage = new Map();
    const first = page(storage);
    await first.run();
    expect(first.context.fetch.mock.calls[0][1].method).toBe('POST');
    expect(first.elements['visit-count'].textContent).toBe('42');
    expect(first.elements['visit-counter'].hidden).toBe(false);
    const refresh = page(storage);
    await refresh.run();
    expect(refresh.context.fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('reads without counting when browser storage is blocked', async () => {
    const p = page();
    p.context.sessionStorage.getItem = () => { throw new Error('Storage blocked'); };
    await p.run();
    expect(p.context.fetch.mock.calls[0][1].method).toBe('GET');
    expect(p.elements['visit-counter'].hidden).toBe(false);
  });

  it('hides failed counting without marking the visit as recorded', async () => {
    const storage = new Map();
    const p = page(storage);
    p.context.fetch.mockRejectedValue(new Error('Offline'));
    await expect(p.run()).resolves.toBeUndefined();
    expect(p.elements['visit-counter'].hidden).toBe(true);
    expect(storage.size).toBe(0);
  });
});
