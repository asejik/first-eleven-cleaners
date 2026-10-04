-- ============================================================================
-- MIGRATION: 20261004_lock_storage_uploads.sql
-- DESCRIPTION: Stop direct browser uploads to the public photo buckets (SEC-25).
--              The app uploads only server-side with the service role
--              (src/lib/storage.ts), after type, size and magic-byte checks.
--              1. Drop the "Authenticated Upload" INSERT policies
--              2. Limit both buckets to 10 MB images
-- TYPE: ADDITIVE hardening (policies removed, bucket limits set; no files touched)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated Upload Garment Photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Claims Photos" ON storage.objects;

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
WHERE id IN ('garment-photos', 'claims-photos');

-- ============================================================================
-- ROLLBACK SCRIPT:
-- CREATE POLICY "Authenticated Upload Garment Photos" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'garment-photos' AND auth.role() = 'authenticated');
-- CREATE POLICY "Authenticated Upload Claims Photos" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'claims-photos' AND auth.role() = 'authenticated');
-- UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--   WHERE id IN ('garment-photos', 'claims-photos');
-- ============================================================================
