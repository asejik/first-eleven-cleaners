import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Post-audit cleanup: conversations (unused since PR-26) and the phone backup
// table (from the PR-18 phone migration) are dropped. The privacy functions
// must stop reading conversations first, or export/anonymize would fail.
// ---------------------------------------------------------------------------
const WEB = join(__dirname, '..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');
const MIGRATION = 'supabase/migrations/20261006_drop_conversations_and_phone_backup.sql';

describe('Unused tables are dropped safely', () => {
  it('the migration replaces the privacy functions before dropping both tables, with a rollback', () => {
    const sql = read(MIGRATION);
    const [forward, rollback] = sql.split('-- ROLLBACK SCRIPT');
    expect(forward).toMatch(/CREATE OR REPLACE FUNCTION public\.export_customer_data/);
    expect(forward).toMatch(/CREATE OR REPLACE FUNCTION public\.anonymize_customer/);
    expect(forward.indexOf('DROP TABLE IF EXISTS conversations')).toBeGreaterThan(forward.indexOf('anonymize_customer'));
    expect(forward).toContain('DROP TABLE IF EXISTS customers_phone_backup_20261005;');
    // nothing outside comments still reads conversations
    const code = forward.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code.replace('DROP TABLE IF EXISTS conversations', '')).not.toMatch(/\bconversations\b/);
    expect(rollback).toContain('-- CREATE TABLE IF NOT EXISTS conversations');
  });

  it('schema.sql and the database types no longer have either table', () => {
    const schema = read('supabase/schema.sql').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(schema).not.toMatch(/\bconversations\b/);
    expect(read('src/types/database.ts')).not.toMatch(/conversations|customers_phone_backup_20261005/);
  });

  it('no app code reads either table', () => {
    for (const f of ['src/lib/message-log.ts', 'src/lib/ai/index.ts', 'src/app/api/twilio/webhook/route.ts']) {
      expect(read(f)).not.toMatch(/from\('conversations'\)|customers_phone_backup/);
    }
  });
});
