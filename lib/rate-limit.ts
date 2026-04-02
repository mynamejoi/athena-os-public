/**
 * In-memory rate limiter for API routes.
 * Tracks request timestamps per IP in a Map with automatic cleanup.
 */

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

const ipMap = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  ipMap.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      ipMap.delete(key);
    }
  });
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

const rateLimit = (options: { limit: number; windowMs: number }) => {
  const { limit, windowMs } = options;

  /**
   * Check if the request is allowed.
   * Returns null if allowed, or a 429 Response if rate limited.
   */
  return (request: Request): Response | null => {
    cleanup(windowMs);

    const ip = getClientIp(request);
    const key = `${ip}`;
    const now = Date.now();

    const entry = ipMap.get(key) || { timestamps: [] };

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    entry.timestamps.push(now);
    ipMap.set(key, entry);

    return null;
  };
};

export default rateLimit;
