-- ============================================================================
-- MIGRATION: 20261004_lock_customer_self_update.sql
-- DESCRIPTION: Stop signed-in users from editing their own role (SEC-04):
--              1. Replace the catch-all customers_self policy with SELECT and
--                 UPDATE policies (UPDATE has a WITH CHECK)
--              2. Browser roles may only update full_name and phone; role,
--                 email and auth_id are writable only by the server (service role)
--              Customer rows are created by the handle_new_user trigger
--              (SECURITY DEFINER), so authenticated users need no INSERT.
-- TYPE: ADDITIVE & IDEMPOTENT (permissions only, no data changes)
-- ============================================================================

-- 1. Replace the catch-all policy with read + limited update
DROP POLICY IF EXISTS customers_self ON customers;
DROP POLICY IF EXISTS customers_select_self ON customers;
DROP POLICY IF EXISTS customers_update_self ON customers;

CREATE POLICY customers_select_self ON customers
  FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY customers_update_self ON customers
  FOR UPDATE USING (auth.uid() = auth_id) WITH CHECK (auth.uid() = auth_id);

-- 2. Column-level privileges: only name and phone are self-editable
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON customers FROM anon, authenticated;
GRANT UPDATE (full_name, phone) ON customers TO authenticated;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP POLICY IF EXISTS customers_select_self ON customers;
-- DROP POLICY IF EXISTS customers_update_self ON customers;
-- CREATE POLICY customers_self ON customers FOR ALL USING (auth.uid() = auth_id);
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON customers TO anon, authenticated;
-- ============================================================================
