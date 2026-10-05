import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-16: production errors are recorded (without personal data) and serious
// ones alert an admin, instead of living only in short-lived Vercel logs.
// ---------------------------------------------------------------------------
const { inserts, emails } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  emails: [] as { to: string | string[]; subject: string; html: string }[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));
vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(async (opts: { to: string; subject: string; html: string }) => {
    emails.push(opts);
    return { success: true };
  }),
}));

import { reportError } from '@/lib/error-reporting';
import { apiError } from '@/lib/api-errors';

const flush = () => new Promise((r) => setTimeout(r, 0));
const originalEnv = { ...process.env };

beforeEach(() => {
  inserts.length = 0;
  emails.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  process.env.ADMIN_ALERT_EMAIL = 'ops@example.com';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Error tracking (PR-16)', () => {
  it('saves the error to error_logs with personal data removed', async () => {
    reportError('api/test-scrub', new Error('Insert failed for jane.doe@example.com phone (214) 555-0100'));
    await flush();
    const row = inserts.find((i) => i.table === 'error_logs')?.row;
    expect(row).toMatchObject({ error_type: 'Error', route: 'api/test-scrub' });
    expect(String(row?.message)).not.toContain('jane.doe@example.com');
    expect(String(row?.message)).not.toContain('555-0100');
    expect(String(row?.message)).toContain('[email]');
  });

  it('emails an admin for serious failures, at most once per 10 minutes per source', async () => {
    reportError('api/test-alert', new Error('Square refund issued but not saved'), { alert: true });
    reportError('api/test-alert', new Error('again'), { alert: true });
    await flush();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('ops@example.com');
    expect(emails[0].subject).toContain('api/test-alert');
  });

  it('never throws, even if logging itself fails', async () => {
    expect(() => reportError('api/x', 'plain string failure')).not.toThrow();
    await flush();
  });

  it('every 5xx returned through apiError is recorded and alerted; 4xx are not', async () => {
    apiError('api/test-500', new Error('db down'), 500);
    apiError('api/test-400', new Error('bad input'), 400);
    await flush();
    expect(inserts.map((i) => i.row.route)).toEqual(['api/test-500']);
    expect(emails.map((e) => e.subject).join(' ')).toContain('api/test-500');
  });
});
