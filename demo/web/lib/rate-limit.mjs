/**
 * Shared in-memory sliding-window rate limiter for the demo.
 *
 * NOTE: On serverless platforms (Cloudflare Workers / Vercel) this is
 * per-isolate only — it blunts casual abuse and cost spikes but is NOT a
 * hard distributed limit. The LLM provider's own quota is the real backstop
 * for the classify endpoint.
 */

const DEFAULT_WINDOW_MS = 60_000;

const stores = new Map();

export function getLimiter(name, maxPerWindow, windowMs = DEFAULT_WINDOW_MS) {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }

  return function rateLimited(ip) {
    const now = Date.now();
    const recent = (store.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= maxPerWindow) {
      store.set(ip, recent);
      return true;
    }
    recent.push(now);
    store.set(ip, recent);
    return false;
  };
}

export function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
