-- Add approval_preferences JSONB column to businesses table
-- Stores per-type auto-approve settings
-- Example: {"auto_approve": true, "types": {"graphic": true, "video": false, "caption": true, "email": false}}
alter table businesses add column if not exists approval_preferences jsonb default '{}'::jsonb;
