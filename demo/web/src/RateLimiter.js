/**
 * Durable Object used as a globally-consistent, atomic rate limiter and daily
 * budget counter for the demo.
 *
 * A single Durable Object serializes requests, so the read-modify-write against
 * its storage is atomic — unlike KV there is no lost-update race, which is what
 * makes the daily hard cap airtight.
 */

const PER_IP_WINDOW_SEC = 60;

export class RateLimiter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.hmacKeyPromise = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/visits' && ['GET', 'POST'].includes(request.method)) {
      let visits = (await this.ctx.storage.get('visits')) || { count: 0, since: null };
      if (request.method === 'POST') {
        // Cloudflare's storage input/output gates serialize this read-modify-write.
        visits = { count: visits.count + 1, since: visits.since || new Date().toISOString() };
        await this.ctx.storage.put('visits', visits);
      }
      return Response.json(visits);
    }
    if (url.pathname === '/check') {
      const ip = request.headers.get('X-Koma-Rate-Key') || 'unknown';
      const useDailyBudget = url.searchParams.get('daily') !== '0';
      const result = await this.check(ip, useDailyBudget);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }

  async check(ip, useDailyBudget = true) {
    const now = Math.floor(Date.now() / 1000);

    // 1) Per-IP sliding window.
    const maxPerIp = Number(this.env.MAX_PER_IP || 30);
    const ipKey = `ip:${await this.hashRateKey(ip)}`;
    const stored = await this.ctx.storage.get(ipKey);
    let hits = Array.isArray(stored) ? stored : (stored?.hits || []);
    hits = hits.filter((t) => now - t < PER_IP_WINDOW_SEC);
    if (hits.length >= maxPerIp) {
      await this.ctx.storage.put(ipKey, { hits });
      await this.scheduleCleanup(hits[0] + PER_IP_WINDOW_SEC);
      return {
        allowed: false,
        reason: 'per-ip',
        retryAfter: Math.max(1, hits[0] + PER_IP_WINDOW_SEC - now),
      };
    }
    hits.push(now);
    await this.ctx.storage.put(ipKey, { hits });
    await this.scheduleCleanup(hits[0] + PER_IP_WINDOW_SEC);

    // 2) Only LLM-backed endpoints consume the global daily budget.
    if (useDailyBudget) {
      const maxDaily = Number(this.env.MAX_DAILY || 500);
      const day = new Date().toISOString().slice(0, 10);
      const dayKey = `day:${day}`;
      const count = (await this.ctx.storage.get(dayKey)) || 0;
      if (count >= maxDaily) {
        return { allowed: false, reason: 'daily', retryAfter: 86400 - (now % 86400) };
      }
      await this.ctx.storage.put(dayKey, count + 1);
    }

    return { allowed: true, reason: null, retryAfter: 0 };
  }

  async hashRateKey(value) {
    if (!this.hmacKeyPromise) {
      this.hmacKeyPromise = (async () => {
        let bytes = await this.ctx.storage.get('rate-limit-hmac-key');
        if (!Array.isArray(bytes) || bytes.length !== 32) {
          bytes = Array.from(crypto.getRandomValues(new Uint8Array(32)));
          await this.ctx.storage.put('rate-limit-hmac-key', bytes);
        }
        return crypto.subtle.importKey(
          'raw',
          new Uint8Array(bytes),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
      })();
    }
    const key = await this.hmacKeyPromise;
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async scheduleCleanup(expiresAtSec) {
    const nextAlarm = expiresAtSec * 1000;
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || nextAlarm < currentAlarm) {
      await this.ctx.storage.setAlarm(nextAlarm);
    }
  }

  async alarm() {
    const now = Math.floor(Date.now() / 1000);
    const entries = await this.ctx.storage.list({ prefix: 'ip:' });
    let nextExpiry = null;

    for (const [key, stored] of entries) {
      const previous = Array.isArray(stored) ? stored : (stored?.hits || []);
      const hits = previous.filter((timestamp) => now - timestamp < PER_IP_WINDOW_SEC);
      if (hits.length === 0) {
        await this.ctx.storage.delete(key);
      } else {
        await this.ctx.storage.put(key, { hits });
        const expiresAt = hits[0] + PER_IP_WINDOW_SEC;
        nextExpiry = nextExpiry === null ? expiresAt : Math.min(nextExpiry, expiresAt);
      }
    }

    // Daily budget counters are operational aggregates, not user identifiers.
    // Keep only the current day so the Durable Object does not grow forever.
    const todayKey = `day:${new Date().toISOString().slice(0, 10)}`;
    const days = await this.ctx.storage.list({ prefix: 'day:' });
    for (const key of days.keys()) {
      if (key !== todayKey) await this.ctx.storage.delete(key);
    }

    if (nextExpiry !== null) {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, nextExpiry * 1000));
    }
  }
}
