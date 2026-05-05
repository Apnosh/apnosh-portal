'use server'

/**
 * Server actions for Google Drive integration.
 *
 * Multi-folder: each client can have N linked folders (brand assets,
 * contracts, content deliverables, etc.) stored in client_drive_folders.
 * Token lives in the single-row `integrations` table.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  listFilesInFolder, refreshAccessToken, extractFolderId, exportGoogleDocAsText,
  type DriveFile,
} from '@/lib/google-drive'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function adminDb() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'admin') return null
  return user.id
}

/**
 * Fetch the current access token for Drive, refreshing if expired.
 */
/** Returns either a valid access_token, or an error code/message. */
async function getValidDriveTokenOrError(): Promise<{ token: string } | { error: string }> {
  const db = adminDb()
  const { data } = await db.from('integrations').select('*').eq('provider', 'google_drive').maybeSingle()
  const row = data as {
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  } | null
  if (!row) return { error: 'no_integration' }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const bufferMs = 60 * 1000
  if (expiresAt - Date.now() > bufferMs) return { token: row.access_token }

  if (!row.refresh_token) return { error: 'token_expired_no_refresh' }

  // Surface env-misconfig early so we don't send empty creds to Google
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { error: 'oauth_env_missing' }
  }

  try {
    const refreshed = await refreshAccessToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await db.from('integrations').update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq('provider', 'google_drive')
    return { token: refreshed.access_token }
  } catch (e) {
    const msg = (e as Error).message
    console.error('[drive] token refresh failed:', msg)
    return { error: `refresh_failed: ${msg}` }
  }
}

async function getValidDriveToken(): Promise<string | null> {
  const r = await getValidDriveTokenOrError()
  return 'token' in r ? r.token : null
}

/**
 * Is Drive connected at all?
 */
export async function isDriveConnected(): Promise<{ connected: boolean; email?: string | null }> {
  if (!(await requireAdmin())) return { connected: false }
  const db = adminDb()
  const { data } = await db.from('integrations').select('metadata').eq('provider', 'google_drive').maybeSingle()
  const row = data as { metadata?: { email?: string } } | null
  if (!row) return { connected: false }
  return { connected: true, email: row.metadata?.email ?? null }
}

export interface LinkedFolder {
  id: string              // client_drive_folders row id
  folderId: string        // Drive folder id
  folderUrl: string | null
  label: string | null
  sortOrder: number
  files: DriveFile[]
  error?: string
}

/**
 * List every linked folder for a client along with its file contents.
 * Returns folders even if one fails — failure is reported per-folder.
 */
export async function listClientDriveFolders(clientId: string): Promise<{
  folders: LinkedFolder[]
  error?: string
}> {
  if (!(await requireAdmin())) return { folders: [], error: 'Not authorized' }

  const db = adminDb()
  const { data: rows, error: selectErr } = await db
    .from('client_drive_folders')
    .select('id, folder_id, folder_url, label, sort_order')
    .eq('client_id', clientId)
    .order('sort_order')
    .order('created_at')

  if (selectErr) return { folders: [], error: selectErr.message }

  const linkRows = (rows ?? []) as Array<{
    id: string; folder_id: string; folder_url: string | null; label: string | null; sort_order: number
  }>

  if (linkRows.length === 0) return { folders: [] }

  const tokenResult = await getValidDriveTokenOrError()
  if ('error' in tokenResult) {
    const reason =
      tokenResult.error === 'no_integration' ? 'Drive not connected'
      : tokenResult.error === 'token_expired_no_refresh' ? 'Drive token expired (no refresh token saved). Reconnect via Settings → Integrations.'
      : tokenResult.error === 'oauth_env_missing' ? 'Drive integration is misconfigured: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars are missing in production.'
      : `Drive token refresh failed: ${tokenResult.error.replace('refresh_failed: ', '')}. Try reconnecting via Settings → Integrations.`
    return {
      folders: linkRows.map(r => ({
        id: r.id, folderId: r.folder_id, folderUrl: r.folder_url,
        label: r.label, sortOrder: r.sort_order, files: [],
        error: reason,
      })),
      error: reason,
    }
  }
  const token = tokenResult.token

  const folders = await Promise.all(linkRows.map(async r => {
    try {
      const files = await listFilesInFolder(token, r.folder_id)
      return {
        id: r.id, folderId: r.folder_id, folderUrl: r.folder_url,
        label: r.label, sortOrder: r.sort_order, files,
      } satisfies LinkedFolder
    } catch (e) {
      return {
        id: r.id, folderId: r.folder_id, folderUrl: r.folder_url,
        label: r.label, sortOrder: r.sort_order, files: [],
        error: (e as Error).message,
      } satisfies LinkedFolder
    }
  }))

  return { folders }
}

/**
 * Add a Drive folder to a client. Accepts URL or raw ID + optional
 * label. Idempotent via the unique(client_id, folder_id) constraint.
 */
export async function addDriveFolder(
  clientId: string,
  input: string,
  label?: string,
): Promise<{ success: boolean; error?: string; folderId?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized' }
  const folderId = extractFolderId(input)
  if (!folderId) return { success: false, error: 'Could not parse a Drive folder ID from that input' }

  const db = adminDb()
  const url = input.includes('drive.google.com') ? input : `https://drive.google.com/drive/folders/${folderId}`

  // Find the current max sort_order so new folders land at the bottom
  const { data: existing } = await db
    .from('client_drive_folders')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (existing as { sort_order?: number } | null)?.sort_order !== undefined
    ? ((existing as { sort_order: number }).sort_order + 1) : 0

  const { error } = await db.from('client_drive_folders').upsert({
    client_id: clientId,
    folder_id: folderId,
    folder_url: url,
    label: label?.trim() || null,
    sort_order: nextOrder,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id, folder_id' })

  if (error) return { success: false, error: error.message }
  return { success: true, folderId }
}

export async function removeDriveFolder(folderRowId: string): Promise<{ success: boolean; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized' }
  const db = adminDb()
  const { error } = await db.from('client_drive_folders').delete().eq('id', folderRowId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function renameDriveFolder(
  folderRowId: string,
  label: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized' }
  const db = adminDb()
  const { error } = await db.from('client_drive_folders')
    .update({ label: label.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', folderRowId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Pull full text content from every Google Doc across ALL linked
 * folders for a client. Used by the AI-extract flow (phase 3).
 */
export async function readClientDocsContent(clientId: string): Promise<{
  docs: Array<{ id: string; name: string; text: string }>
  error?: string
}> {
  if (!(await requireAdmin())) return { docs: [], error: 'Not authorized' }
  const { folders } = await listClientDriveFolders(clientId)
  if (folders.length === 0) return { docs: [], error: 'No folders linked' }
  const token = await getValidDriveToken()
  if (!token) return { docs: [], error: 'Drive not connected' }

  const docs: Array<{ id: string; name: string; text: string }> = []
  for (const folder of folders) {
    for (const f of folder.files) {
      if (f.mimeType !== 'application/vnd.google-apps.document') continue
      const text = await exportGoogleDocAsText(token, f.id)
      if (text) docs.push({ id: f.id, name: f.name, text })
    }
  }
  return { docs }
}
