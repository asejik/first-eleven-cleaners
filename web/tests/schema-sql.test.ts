import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// PR-23: supabase/schema.sql must be able to build a new database. Full check is
// a real Postgres run (see the audit testing guide); this catches the common
// breakages in CI.
// ---------------------------------------------------------------------------
const schema = readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
const withoutComments = schema.replace(/--.*$/gm, '');

describe('schema.sql stays loadable and complete (PR-23)', () => {
  it('every dollar-quoted body is closed with the same tag', () => {
    const tags = withoutComments.match(/\$[A-Za-z_]*\$/g) || [];
    const counts = new Map<string, number>();
    for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
    for (const [tag, n] of counts) expect(n % 2, `${tag} appears ${n} times`).toBe(0);
    expect(withoutComments).not.toMatch(/^\$ LANGUAGE/m);
  });

  it('includes the objects added by migrations', () => {
    for (const fragment of [
      'CREATE TABLE IF NOT EXISTS admin_audit_logs',
      'refunded_amount',
      'square_refund_id',
      'reserve_promo_use',
      'link_customer_on_email_confirm',
      "'express_24hr'",
      'idx_orders_pickup_composite',
      'REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon',
    ]) {
      expect(schema, fragment).toContain(fragment);
    }
  });
});
