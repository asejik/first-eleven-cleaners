-- ============================================================================
-- MIGRATION: 20261005_tighten_table_grants.sql
-- DESCRIPTION: Remove default table privileges the browser roles never use
--              (SEC-27). RLS stays the row-level control; this removes whole
--              classes of access so one loose policy can't expose a table.
--              1. No TRUNCATE / TRIGGER / REFERENCES for anon or authenticated
--              2. Logged-out visitors (anon) can't write any public table
--              Signed-in users keep only the column grants on customers set by
--              20261004_lock_customer_self_update and
--              20261004_grant_sms_consent_self_update. All server writes use
--              the service role and are unaffected.
-- TYPE: ADDITIVE hardening (privileges only, no data changes)
-- ============================================================================

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- Same defaults for tables created later
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO anon;
-- ============================================================================
