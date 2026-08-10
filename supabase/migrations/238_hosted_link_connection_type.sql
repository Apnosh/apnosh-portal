-- 238: allow the hosted_link connection type (social vendor lane).
--
-- THE BUG THIS FIXES (found live 2026-08-10): channel_connections was created in 043
-- with CHECK (connection_type IN ('oauth','api_key','manual','csv_import','built_in')).
-- The social vendor adapters (zernio/ayrshare) insert connection_type = 'hosted_link',
-- so every insert silently violated the constraint and NO social connection row was
-- ever stored — the owner linked Instagram + Facebook on the vendor and the portal
-- could never see it. 'upload' is included for the CSV-less upload lane as well.

ALTER TABLE channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_connection_type_check;

ALTER TABLE channel_connections
  ADD CONSTRAINT channel_connections_connection_type_check
  CHECK (connection_type IN ('oauth','api_key','manual','csv_import','built_in','hosted_link','upload'));
