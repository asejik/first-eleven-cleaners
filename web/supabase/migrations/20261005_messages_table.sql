-- ============================================================================
-- MIGRATION: 20261005_messages_table.sql
-- DESCRIPTION: One row per message instead of one growing array per customer
--              (P03 PR-26).
--              Before: every SMS, notification, reply and escalation read the
--              customer's whole conversations.messages array and wrote it back
--              with one more entry. Two messages at once lost one of them, and
--              each write got bigger forever.
--              messages holds one row per message. The existing arrays are copied
--              in; conversations is left in place (no longer written) and can be
--              dropped later.
-- TYPE: ADDITIVE (new table + copy of existing messages; conversations unchanged)
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('web', 'sms', 'whatsapp')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL DEFAULT '',
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  stage VARCHAR(50),
  media_url TEXT,
  mode VARCHAR(50), -- simulated, live, ai_reply, ai_escalation, growth_winback ...
  external_id VARCHAR(100), -- Twilio message SID, or the id from the old array
  from_address VARCHAR(100),
  to_address VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_customer_channel ON messages(customer_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id) WHERE order_id IS NOT NULL;

-- Server writes only; a signed-in customer may read their own messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_customer_read ON messages;
CREATE POLICY messages_customer_read ON messages
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));
REVOKE ALL ON messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON messages FROM authenticated;

-- Copy the existing arrays (skipped for a customer/channel that already has rows,
-- so running this file twice does not duplicate them)
INSERT INTO messages (customer_id, channel, direction, body, order_id, stage, media_url, mode,
                      external_id, from_address, to_address, created_at)
SELECT
  c.customer_id,
  c.channel,
  CASE WHEN m->>'direction' = 'inbound' THEN 'inbound' ELSE 'outbound' END,
  coalesce(m->>'text', ''),
  o.id,
  left(m->>'stage', 50),
  m->>'media_url',
  left(m->>'mode', 50),
  left(m->>'id', 100),
  left(m->>'from', 100),
  left(m->>'to', 100),
  CASE WHEN m->>'created_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
       THEN (m->>'created_at')::TIMESTAMPTZ
       ELSE c.updated_at + make_interval(secs => n / 1000.0) END
FROM conversations c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.messages) = 'array' THEN c.messages ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(m, n)
LEFT JOIN orders o
  ON o.id = CASE WHEN m->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (m->>'order_id')::UUID END
WHERE c.customer_id IS NOT NULL
  AND jsonb_typeof(m) = 'object'
  AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.customer_id = c.customer_id AND x.channel = c.channel);

-- ============================================================================
-- ROLLBACK SCRIPT (conversations still holds every message written before this
-- migration; messages written after it exist only in the messages table):
-- DROP TABLE IF EXISTS messages;
-- ============================================================================
