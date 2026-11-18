/**
 * A small per-key request limiter for the lookup routes: `limit` requests in each `windowMs` window.
 *
 * It lives in the memory of one server instance, so it slows down a script hammering the routes but is not a hard
 * guarantee across instances. The routes are also cached, which does most of the work of protecting Yahoo.
 */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();
  return function allow(key: string): boolean {
    const t = now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k); // keep the map from growing without end
    }
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      return true;
    }
    h.count++;
    return h.count <= limit;
  };
}

/** Best guess at the caller, from the forwarded address the host adds. Falls back to one shared bucket. */
export function callerKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "unknown";
}
