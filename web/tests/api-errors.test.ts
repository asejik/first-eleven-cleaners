import { describe, it, expect, vi } from 'vitest';
import { apiError } from '@/lib/api-errors';

describe('apiError hides internal error text from clients (SEC-19)', () => {
  it('returns a generic 500 message and logs the real error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = apiError('api/test', new Error('duplicate key value violates unique constraint "customers_email_key"'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain('customers_email_key');
    expect(log).toHaveBeenCalledWith('[api/test]', expect.any(Error));
    log.mockRestore();
  });

  it('returns a generic 400 message for bad input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = apiError('api/test', new SyntaxError('Unexpected token } in JSON at position 12'), 400);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).not.toContain('Unexpected token');
  });
});
