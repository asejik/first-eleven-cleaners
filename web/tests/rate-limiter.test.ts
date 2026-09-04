import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

describe('Rate Limiter & Client IP Extraction', () => {
  describe('checkRateLimit()', () => {
    it('allows requests within limit and tracks remaining quota', () => {
      const id = `test_user_${Date.now()}_1`;
      const res1 = checkRateLimit(id, 3, 60000);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = checkRateLimit(id, 3, 60000);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = checkRateLimit(id, 3, 60000);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it('blocks requests once limit is exceeded', () => {
      const id = `test_user_${Date.now()}_2`;
      // Exhaust quota of 2
      checkRateLimit(id, 2, 60000);
      checkRateLimit(id, 2, 60000);

      // Third request must be blocked
      const blocked = checkRateLimit(id, 2, 60000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('maintains independent rate limit counters per unique identifier', () => {
      const idA = `test_user_${Date.now()}_A`;
      const idB = `test_user_${Date.now()}_B`;

      checkRateLimit(idA, 1, 60000);
      const blockedA = checkRateLimit(idA, 1, 60000);
      expect(blockedA.allowed).toBe(false);

      // idB should still be allowed
      const allowedB = checkRateLimit(idB, 1, 60000);
      expect(allowedB.allowed).toBe(true);
    });
  });

  describe('getClientIp()', () => {
    it('extracts primary client IP from x-forwarded-for header', () => {
      const req = new Request('https://firstelevencleaners.com/api/bookings', {
        headers: { 'x-forwarded-for': '198.51.100.24, 10.0.0.1, 172.16.0.1' },
      });
      expect(getClientIp(req)).toBe('198.51.100.24');
    });

    it('extracts client IP from x-real-ip header when x-forwarded-for is missing', () => {
      const req = new Request('https://firstelevencleaners.com/api/bookings', {
        headers: { 'x-real-ip': '203.0.113.195' },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('defaults to 127.0.0.1 when no proxy IP headers are present', () => {
      const req = new Request('https://firstelevencleaners.com/api/bookings');
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });
});
