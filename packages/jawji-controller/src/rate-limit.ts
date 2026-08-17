// rate-limit.ts
// Simple in-memory fixed-window rate limiter for Express routes.
//
// NOTE: Not wired into the app yet — index.ts (owned by another agent) should
// mount it, e.g.:
//   import { createRateLimiter } from './rate-limit.js';
//   app.use('/api/v1/auth', createRateLimiter({ windowMs: 60_000, max: 5 }));
//
// In-memory is fine for this single-node daemon; requests are keyed by client
// IP. Do NOT use behind a proxy unless you trust the X-Forwarded-For headers.

import type { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
  } = options;
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? 'unknown');
  const hits = new Map<string, number[]>();

  // Periodically drop expired buckets so the map can't grow unbounded.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, stamps] of hits) {
      const fresh = stamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, fresh);
      }
    }
  }, Math.max(windowMs, 60_000) / 2);
  cleanup.unref?.();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req);
    const now = Date.now();
    const stamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    stamps.push(now);
    hits.set(key, stamps);

    if (stamps.length > max) {
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}
