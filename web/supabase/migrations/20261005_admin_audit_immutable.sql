-- ============================================================================
-- MIGRATION: 20261005_admin_audit_immutable.sql
-- DESCRIPTION: Make admin_audit_logs append-only (P03 PR-24). RLS alone does not
--              stop the server's service role from editing or deleting rows; these
--              triggers do. Rows can be added, never changed or removed.
--              (A database owner can still disable the triggers deliberately in
--              the SQL Editor; that is visible in Postgres logs.)
-- TYPE: ADDITIVE (triggers only; no data changes)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_audit_logs_block_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_logs_block_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_audit_logs_no_update_delete ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_logs_block_changes();

DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_audit_logs_block_changes();

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON admin_audit_logs;
-- DROP TRIGGER IF EXISTS admin_audit_logs_no_update_delete ON admin_audit_logs;
-- DROP FUNCTION IF EXISTS public.admin_audit_logs_block_changes();
-- ============================================================================
