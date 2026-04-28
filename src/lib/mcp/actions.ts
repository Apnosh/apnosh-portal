'use server'

/**
 * Admin server actions for managing MCP API keys.
 *
 *   - createMcpKey(clientId, label)  -- generates a new key, returns the
 *     plaintext ONCE. Caller must show + tell the user to copy it; we never
 *     store the plaintext.
 *   - listMcpKeys(clientId)          -- list keys (prefix only, never raw)
 *   - revokeMcpKey(keyId)            -- mark revoked (sets revoked_at)
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { generateKey } from './auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }
  return { ok: true, userId: user.id }
}

export interface McpKeySummary {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  expiresAt: string | null
}

export async function createMcpKey(clientId: string, label: string): Promise<
  | { success: true; data: { id: string; label: string; rawKey: string; prefix: string } }
  | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!label.trim()) return { success: false, error: 'Label required' }

  const { raw, hash, prefix } = generateKey()
  const db = adminDb()
  const { data, error } = await db
    .from('mcp_api_keys')
    .insert({
      client_id: clientId,
      label: label.trim(),
      key_hash: hash,
      key_prefix: prefix,
      created_by: auth.userId,
    })
    .select('id, label')
    .single()
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: { id: data.id as string, label: data.label as string, rawKey: raw, prefix },
  }
}

export async function listMcpKeys(clientId: string): Promise<
  { success: true; data: McpKeySummary[] } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { data, error } = await db
    .from('mcp_api_keys')
    .select('id, label, key_prefix, created_at, last_used_at, revoked_at, expires_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map(r => ({
      id: r.id as string,
      label: r.label as string,
      prefix: r.key_prefix as string,
      createdAt: r.created_at as string,
      lastUsedAt: (r.last_used_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
    })),
  }
}

export async function revokeMcpKey(keyId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { error } = await db
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .is('revoked_at', null)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
