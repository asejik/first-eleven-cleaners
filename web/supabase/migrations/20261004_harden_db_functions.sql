-- ============================================================================
-- MIGRATION: 20261004_harden_db_functions.sql
-- DESCRIPTION: Remaining Supabase Security Advisor items (SEC-17):
--              1. Pin search_path on update_timestamp_column
--              2. rls_auto_enable() must not be callable via /rest/v1/rpc
--              (handle_new_user was hardened in 20261004_role_based_staff_access)
-- TYPE: ADDITIVE hardening (no data changes)
-- ============================================================================

ALTER FUNCTION public.update_timestamp_column() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER FUNCTION public.update_timestamp_column() RESET search_path;
-- GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated;
-- ============================================================================
