import type { RequestHandler } from 'express';

// Rate limiter in-memory sederhana (per key + window). Cukup untuk phase 1.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(limit: number, windowMs: number, label = 'general'): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const key = `${label}:${ip}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    b.count++;
    if (b.count > limit) {
      res.status(429).json({ error: 'Too many requests. Silakan coba lagi nanti.' });
      return;
    }
    next();
  };
}

// Bersihkan bucket kadaluarsa (dipanggil berkala dari index.ts)
export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}