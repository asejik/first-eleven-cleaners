import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-12: Supabase clients were untyped, so every query result was `any`: a
// renamed or missing column compiled cleanly and failed at runtime (as with
// SEC-26 and SEC-29). The clients now use the generated Database type, which
// also caught the ambiguous orders -> customers embed fixed in AR-23.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('Typed Supabase clients (AR-12)', () => {
  it.each([
    ['src/lib/supabase/admin.ts', 'createClient<Database>('],
    ['src/lib/supabase/server.ts', 'createServerClient<Database>('],
    ['src/lib/supabase/client.ts', 'createBrowserClient<Database>('],
  ])('%s passes the Database type', (file, call) => {
    expect(src(file)).toContain(call);
  });

  it('the generated types include the columns added by recent migrations', () => {
    const types = src('src/types/database.ts');
    for (const column of ['assigned_driver_id', 'idempotency_key', 'refunded_amount', 'sales_tax', 'square_card_id', 'sms_consent']) {
      expect(types, column).toContain(`${column}`);
    }
    expect(types).toMatch(/create_booking: \{ Args: \{ p: Json \}/);
  });
});
