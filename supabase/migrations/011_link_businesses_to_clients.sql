-- ============================================================
-- Link businesses (old schema) to clients (new schema)
-- ============================================================
-- The /dashboard portal is built on businesses (owner_id linked to auth users).
-- The new content request flow lives in content_queue (linked to clients).
-- Bridge them: businesses.client_id → clients.id. One business = one client.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_client_id ON businesses(client_id);

-- Helper: resolve current user's client_id via their business
CREATE OR REPLACE FUNCTION public.current_user_client_id()
RETURNS uuid AS $$
  SELECT client_id FROM businesses WHERE owner_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Extend RLS policies so dashboard users can see content_queue + client_feedback
-- via their business.client_id bridge ──

-- content_queue: dashboard user reads own queue (via business link)
DROP POLICY IF EXISTS "Dashboard user reads queue" ON content_queue;
CREATE POLICY "Dashboard user reads queue" ON content_queue FOR SELECT
  USING (client_id = current_user_client_id());

DROP POLICY IF EXISTS "Dashboard user submits requests" ON content_queue;
CREATE POLICY "Dashboard user submits requests" ON content_queue FOR INSERT
  WITH CHECK (
    client_id = current_user_client_id()
    AND request_type = 'client_request'
    AND submitted_by = 'client'
  );

-- client_feedback: dashboard user reads + submits for own queue
DROP POLICY IF EXISTS "Dashboard user reads feedback" ON client_feedback;
CREATE POLICY "Dashboard user reads feedback" ON client_feedback FOR SELECT
  USING (
    content_queue_id IN (
      SELECT id FROM content_queue WHERE client_id = current_user_client_id()
    )
  );

DROP POLICY IF EXISTS "Dashboard user submits feedback" ON client_feedback;
CREATE POLICY "Dashboard user submits feedback" ON client_feedback FOR INSERT
  WITH CHECK (
    content_queue_id IN (
      SELECT id FROM content_queue WHERE client_id = current_user_client_id()
    )
  );

-- ── Link existing test businesses to the Apnosh client ──
-- Bella (the test account being used) is linked to Apnosh for testing.
UPDATE businesses
SET client_id = (SELECT id FROM clients WHERE slug = 'apnosh' LIMIT 1)
WHERE client_id IS NULL
  AND name ILIKE '%Bella%';
