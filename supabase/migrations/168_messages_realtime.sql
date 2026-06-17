-- ── Realtime for owner ↔ team messaging ──────────────────────────────
--
-- The new owner Messages screen (src/components/mvp/mvp-messages.tsx) and the
-- admin messages page both subscribe to postgres_changes INSERTs on `messages`
-- to render live replies. Postgres only emits CDC for tables in the
-- supabase_realtime publication, and `messages` / `message_threads` were never
-- added (only reviews, content_queue, social_metrics, etc. were). Without this
-- the subscription is a silent no-op — replies appear only after re-opening the
-- thread. Idempotent (matches the pattern in 020_social_final_build.sql): a
-- duplicate ADD TABLE is swallowed, so this is safe whether or not the table was
-- already enabled via the Supabase dashboard.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages;        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE message_threads; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REPLICA IDENTITY FULL so realtime filters on non-PK columns (the client
-- subscribes with filter `thread_id=eq.…`, the admin page with `business_id`)
-- resolve correctly for every change type, not just the primary key.
ALTER TABLE messages        REPLICA IDENTITY FULL;
ALTER TABLE message_threads REPLICA IDENTITY FULL;
