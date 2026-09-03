import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './RateLimiter.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.alarmAt = null;
  }

  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix } = {}) {
    return new Map([...this.values].filter(([key]) => !prefix || key.startsWith(prefix)));
  }
  async getAlarm() { return this.alarmAt; }
  async setAlarm(value) { this.alarmAt = value; }
}

describe('demo Durable Object rate limiter', () => {
  let storage;
  let limiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T10:00:00.000Z'));
    storage = new MemoryStorage();
    limiter = new RateLimiter({ storage }, { MAX_PER_IP: 2, MAX_DAILY: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a keyed identifier instead of the raw IP and schedules cleanup', async () => {
    const rawIp = '203.0.113.42';
    expect((await limiter.check(rawIp, false)).allowed).toBe(true);

    const keys = [...storage.values.keys()];
    expect(keys.some((key) => key.includes(rawIp))).toBe(false);
    expect(keys.filter((key) => key.startsWith('ip:'))).toHaveLength(1);
    expect(storage.alarmAt).toBe(Date.now() + 60_000);
    expect(keys).not.toContain('day:2026-08-25');
  });

  it('enforces the per-identifier window and optional daily budget', async () => {
    expect((await limiter.check('203.0.113.5', true)).allowed).toBe(true);
    expect((await limiter.check('203.0.113.5', true)).allowed).toBe(true);
    const blocked = await limiter.check('203.0.113.5', true);

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('per-ip');
    expect(storage.values.get('day:2026-08-25')).toBe(2);
  });

  it('deletes expired window data, including legacy raw-IP keys', async () => {
    await limiter.check('203.0.113.6', false);
    storage.values.set('ip:198.51.100.9', [Math.floor(Date.now() / 1000) - 120]);
    vi.advanceTimersByTime(61_000);

    await limiter.alarm();

    expect([...storage.values.keys()].filter((key) => key.startsWith('ip:'))).toHaveLength(0);
  });

  it('keeps only the current daily aggregate during alarm cleanup', async () => {
    storage.values.set('day:2026-08-24', 99);
    storage.values.set('day:2026-08-25', 1);

    await limiter.alarm();

    expect(storage.values.has('day:2026-08-24')).toBe(false);
    expect(storage.values.get('day:2026-08-25')).toBe(1);
  });

  it('counts visits durably without consuming rate limits or the model budget', async () => {
    const read = () => new Request('https://do/visits');
    const visit = () => new Request('https://do/visits', { method: 'POST' });
    expect(await (await limiter.fetch(read())).json()).toEqual({ count: 0, since: null });
    const first = await (await limiter.fetch(visit())).json();
    expect(first).toEqual({ count: 1, since: '2026-08-25T10:00:00.000Z' });
    expect(await (await limiter.fetch(read())).json()).toEqual(first);
    await limiter.alarm();
    const restarted = new RateLimiter({ storage }, {});
    expect(await (await restarted.fetch(visit())).json()).toEqual({ ...first, count: 2 });
    expect([...storage.values.keys()]).toEqual(['visits']);
  });
});
