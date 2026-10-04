-- ============================================================================
-- MIGRATION: 20261004_square_card_on_file.sql
-- DESCRIPTION: Store Square card-on-file references (SEC-05, SEC-06).
--              Booking saves the customer's card to a Square customer; intake
--              charges that saved card for the final weighed total.
--              1. customers.square_customer_id: reused across bookings
--              2. orders.square_customer_id / square_card_id: the card to
--                 charge for this order
-- TYPE: ADDITIVE & IDEMPOTENT (Safe, non-destructive)
-- ============================================================================

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS square_customer_id VARCHAR(255);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS square_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS square_card_id VARCHAR(255);

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE orders DROP COLUMN IF EXISTS square_card_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS square_customer_id;
-- ALTER TABLE customers DROP COLUMN IF EXISTS square_customer_id;
-- ============================================================================
