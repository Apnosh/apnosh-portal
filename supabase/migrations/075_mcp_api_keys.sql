-- ============================================================
-- Migration 075: MCP API Keys
-- ============================================================
-- API keys that authenticate Model Context Protocol (MCP) clients
-- against the Apnosh portal. Each key is scoped to one client_id
-- so that any agent (Claude Desktop, the restaurant's GPT, third-
-- party tools) can take actions on that client's data without web
-- session auth.
--
-- Keys are hashed at rest (sha256). Plaintext is shown once at
-- creation, like a personal access token.
-- ============================================================

create table if not exists mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Human-readable label, e.g. "Mark's Claude Desktop" or "Toast integration"
  label text not null,
  -- sha256 of the raw key. Lookup uses this; raw key is never stored.
  key_hash text not null unique,
  -- First 8 chars of the raw key for display ("apk_abc1...") so admins can
  -- recognize keys without unmasking them.
  key_prefix text not null,
  -- Optional capability scoping. Empty array = all capabilities the client
  -- has via entitlements. Specific values restrict further.
  capabilities text[] not null default '{}',
  -- Optional expiration. Null = never expires.
  expires_at timestamptz,
  -- Audit
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_mcp_keys_client on mcp_api_keys(client_id);
create index if not exists idx_mcp_keys_hash on mcp_api_keys(key_hash) where revoked_at is null;

alter table mcp_api_keys enable row level security;

create policy "admins manage mcp_api_keys"
  on mcp_api_keys for all using (is_admin()) with check (is_admin());

create policy "clients read their mcp_api_keys"
  on mcp_api_keys for select
  using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
