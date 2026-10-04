-- ============================================================================
-- MIGRATION: 20261005_private_photo_buckets.sql
-- DESCRIPTION: Make the photo buckets private (SEC-30). Rows keep their
--              permanent object URLs; every API response now swaps them for
--              signed URLs (1 hour; 24 hours for MMS). Public object URLs stop
--              working, so forwarded or leaked links expire.
--              DEPLOY ORDER: ship the signed-URL code first, then run this.
-- TYPE: CONFIG change (bucket visibility; no data changes)
-- ============================================================================

UPDATE storage.buckets SET public = false WHERE id IN ('garment-photos', 'claims-photos');

-- ============================================================================
-- ROLLBACK SCRIPT:
-- UPDATE storage.buckets SET public = true WHERE id IN ('garment-photos', 'claims-photos');
-- ============================================================================
