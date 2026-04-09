-- ============================================================
-- Client Portal Auth + End-to-End Flow
-- ============================================================
-- Links client_users to Supabase Auth via magic link,
-- enables client-scoped RLS, adds storage buckets + policies,
-- and turns on realtime for content_queue + client_feedback.

-- ── 1. Link client_users to auth.users ───────────────────────
ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_users_auth_user_id ON client_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_email_lower ON client_users(lower(email));

-- Helper: is the current auth user a client_user?
CREATE OR REPLACE FUNCTION public.current_client_user_id()
RETURNS uuid AS $$
  SELECT id FROM client_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get the client_id this auth user belongs to (via client_users)
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid AS $$
  SELECT client_id FROM client_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 2. Enable client-scoped RLS policies ─────────────────────
-- These sit alongside the existing "Admins manage *" policies.

-- clients: client reads own row
DROP POLICY IF EXISTS "Client reads own client" ON clients;
CREATE POLICY "Client reads own client" ON clients FOR SELECT
  USING (id = current_client_id());

-- client_brands: client reads own
DROP POLICY IF EXISTS "Client reads own brand" ON client_brands;
CREATE POLICY "Client reads own brand" ON client_brands FOR SELECT
  USING (client_id = current_client_id());

-- client_patterns: client reads own
DROP POLICY IF EXISTS "Client reads own patterns" ON client_patterns;
CREATE POLICY "Client reads own patterns" ON client_patterns FOR SELECT
  USING (client_id = current_client_id());

-- client_users: client reads roster of own client
DROP POLICY IF EXISTS "Client reads own roster" ON client_users;
CREATE POLICY "Client reads own roster" ON client_users FOR SELECT
  USING (client_id = current_client_id());

-- client_assets: client reads own + can insert with uploaded_by='client'
DROP POLICY IF EXISTS "Client reads own assets" ON client_assets;
CREATE POLICY "Client reads own assets" ON client_assets FOR SELECT
  USING (client_id = current_client_id());

DROP POLICY IF EXISTS "Client inserts own assets" ON client_assets;
CREATE POLICY "Client inserts own assets" ON client_assets FOR INSERT
  WITH CHECK (
    client_id = current_client_id()
    AND uploaded_by = 'client'
    AND uploaded_by_user_id = current_client_user_id()
  );

-- style_library: client reads only visible posts
DROP POLICY IF EXISTS "Client reads visible library" ON style_library;
CREATE POLICY "Client reads visible library" ON style_library FOR SELECT
  USING (client_id = current_client_id() AND client_visible = true);

-- content_queue: client reads own requests, can insert new client_request rows,
-- can update only their own rows (for completeness, but most writes go through server actions)
DROP POLICY IF EXISTS "Client reads own queue" ON content_queue;
CREATE POLICY "Client reads own queue" ON content_queue FOR SELECT
  USING (client_id = current_client_id());

DROP POLICY IF EXISTS "Client submits own requests" ON content_queue;
CREATE POLICY "Client submits own requests" ON content_queue FOR INSERT
  WITH CHECK (
    client_id = current_client_id()
    AND request_type = 'client_request'
    AND submitted_by = 'client'
    AND submitted_by_user_id = current_client_user_id()
  );

-- client_feedback: client reads feedback for own queue, can insert own feedback
DROP POLICY IF EXISTS "Client reads own feedback" ON client_feedback;
CREATE POLICY "Client reads own feedback" ON client_feedback FOR SELECT
  USING (
    content_queue_id IN (
      SELECT id FROM content_queue WHERE client_id = current_client_id()
    )
  );

DROP POLICY IF EXISTS "Client submits feedback" ON client_feedback;
CREATE POLICY "Client submits feedback" ON client_feedback FOR INSERT
  WITH CHECK (
    user_id = current_client_user_id()
    AND content_queue_id IN (
      SELECT id FROM content_queue WHERE client_id = current_client_id()
    )
  );

-- ── 3. Realtime publications ─────────────────────────────────
-- Add tables to supabase_realtime publication so clients get live updates
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE content_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE client_feedback;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. Storage buckets ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('post-drafts', 'post-drafts', true),
  ('client-photos', 'client-photos', true),
  ('client-graphics', 'client-graphics', true),
  ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on the shared buckets (admin uses service role to upload)
DO $$ BEGIN
  CREATE POLICY "Public read post-drafts" ON storage.objects FOR SELECT
    USING (bucket_id = 'post-drafts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read client-photos" ON storage.objects FOR SELECT
    USING (bucket_id = 'client-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read client-graphics" ON storage.objects FOR SELECT
    USING (bucket_id = 'client-graphics');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read client-logos" ON storage.objects FOR SELECT
    USING (bucket_id = 'client-logos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated uploads (admin + client_user)
DO $$ BEGIN
  CREATE POLICY "Authenticated upload post-drafts" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'post-drafts' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated upload client-photos" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'client-photos' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
