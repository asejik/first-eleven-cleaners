interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Periodically clean up stale rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * In-memory sliding window rate limiter for API endpoints.
 * @param identifier Unique identifier (e.g. IP address + route key)
 * @param maxRequests Maximum allowed requests within the time window
 * @param windowMs Time window in milliseconds (default 60 seconds)
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 20,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * Asynchronous distributed rate limiter designed for serverless environments (Vercel).
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN)
 * are configured, coordinates atomic rate limits across distributed serverless instances via HTTPS REST.
 * Gracefully falls back to the in-memory sliding window limiter in local development, tests,
 * or if Redis is unconfigured/unreachable (F002).
 */
export async function checkRateLimitAsync(
  identifier: string,
  maxRequests: number = 20,
  windowMs: number = 60 * 1000
): Promise<{ allowed: boolean; remaining: number }> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken && !redisUrl.includes('placeholder')) {
    try {
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      const key = `f11:ratelimit:${identifier}`;

      // Upstash REST Pipeline executes atomic INCR and EXPIRE in a single HTTPS roundtrip
      const response = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, windowSeconds],
        ]),
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        // Upstash pipeline response format: [{ result: number }, { result: number }]
        const currentCount = Array.isArray(data) ? Number(data[0]?.result) : NaN;
        if (!isNaN(currentCount)) {
          const allowed = currentCount <= maxRequests;
          const remaining = Math.max(0, maxRequests - currentCount);
          return { allowed, remaining };
        }
      }
    } catch (err) {
      console.warn('Distributed rate limiter network fallback to in-memory:', err);
    }
  }

  // Local in-memory sliding window fallback
  return checkRateLimit(identifier, maxRequests, windowMs);
}

/**
 * Extracts client IP safely from request headers.
 * Prioritizes edge-verified headers (x-vercel-ip, cf-connecting-ip) to prevent
 * client header spoofing attacks on rate limiters (SEC-012).
 */
export function getClientIp(req: Request): string {
  // 1. Edge-verified reverse proxy headers (Vercel & Cloudflare strip client-sent headers)
  const vercelIp = req.headers.get('x-vercel-ip');
  if (vercelIp) {
    return vercelIp.trim();
  }

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  // 2. Standard proxy header fallback
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return '127.0.0.1';
}
