/**
 * MCP authentication.
 *
 * MCP requests carry an API key in `Authorization: Bearer <key>`. We
 * sha256-hash and look up against mcp_api_keys to find the client_id.
 * That client_id becomes the principal for all subsequent tool calls.
 */

import { createHash, randomBytes } from 'crypto'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

export interface McpPrincipal {
  keyId: string
  clientId: string
  capabilities: string[]
}

const KEY_PREFIX = 'apk_'

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Generate a new raw key. Caller is responsible for storing only the hash. */
export function generateKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`
  return {
    raw,
    hash: hashKey(raw),
    prefix: raw.slice(0, KEY_PREFIX.length + 4) + '...',
  }
}

/**
 * Validate a Bearer token. Returns the principal on success, or an error
 * on any failure (missing/wrong/expired/revoked key).
 */
export async function authenticateMcp(authHeader: string | null): Promise<
  { ok: true; principal: McpPrincipal } | { ok: false; error: string }
> {
  if (!authHeader) return { ok: false, error: 'Missing Authorization header' }
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return { ok: false, error: 'Authorization must be Bearer <key>' }
  const raw = match[1].trim()
  if (!raw.startsWith(KEY_PREFIX)) return { ok: false, error: 'Invalid key format' }

  const hash = hashKey(raw)
  const db = adminDb()
  const { data, error } = await db
    .from('mcp_api_keys')
    .select('id, client_id, capabilities, expires_at, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()

  if (error) return { ok: false, error: 'Key lookup failed' }
  if (!data) return { ok: false, error: 'Invalid key' }
  if (data.revoked_at) return { ok: false, error: 'Key revoked' }
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) {
    return { ok: false, error: 'Key expired' }
  }

  // Touch last_used_at (fire and forget)
  void db
    .from('mcp_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    ok: true,
    principal: {
      keyId: data.id as string,
      clientId: data.client_id as string,
      capabilities: (data.capabilities as string[]) ?? [],
    },
  }
}
