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
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/check') {
      const ip = url.searchParams.get('ip') || 'unknown';
      const result = await this.check(ip);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }

  async check(ip) {
    const now = Math.floor(Date.now() / 1000);

    // 1) Per-IP sliding window.
    const maxPerIp = Number(this.env.MAX_PER_IP || 30);
    const ipKey = `ip:${ip}`;
    let hits = (await this.ctx.storage.get(ipKey)) || [];
    hits = hits.filter((t) => now - t < PER_IP_WINDOW_SEC);
    if (hits.length >= maxPerIp) {
      await this.ctx.storage.put(ipKey, hits);
      return {
        allowed: false,
        reason: 'per-ip',
        retryAfter: Math.max(1, hits[0] + PER_IP_WINDOW_SEC - now),
      };
    }
    hits.push(now);
    await this.ctx.storage.put(ipKey, hits);

    // 2) Global daily hard cap — the real budget guard.
    const maxDaily = Number(this.env.MAX_DAILY || 500);
    const day = new Date().toISOString().slice(0, 10);
    const dayKey = `day:${day}`;
    const count = (await this.ctx.storage.get(dayKey)) || 0;
    if (count >= maxDaily) {
      return { allowed: false, reason: 'daily', retryAfter: 86400 - (now % 86400) };
    }
    await this.ctx.storage.put(dayKey, count + 1);

    return { allowed: true, reason: null, retryAfter: 0 };
  }
}
