'use server'

/**
 * Server actions for Google Drive integration.
 *
 * All Drive API calls go through here so the access_token + refresh_token
 * never touch the browser. The `integrations` row is admin-only per RLS.
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

/** Whether an admin is currently signed in. Wraps the awkward createClient pattern. */
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
 * Persists the new token back to integrations.
 */
async function getValidDriveToken(): Promise<string | null> {
  const db = adminDb()
  const { data } = await db.from('integrations').select('*').eq('provider', 'google_drive').maybeSingle()
  const row = data as {
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  } | null
  if (!row) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const bufferMs = 60 * 1000 // refresh if expires within 60s
  if (expiresAt - Date.now() > bufferMs) return row.access_token

  if (!row.refresh_token) return null
  try {
    const refreshed = await refreshAccessToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await db.from('integrations').update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq('provider', 'google_drive')
    return refreshed.access_token
  } catch (e) {
    console.error('[drive] token refresh failed:', (e as Error).message)
    return null
  }
}

/**
 * Public API: is Drive connected at all?
 */
export async function isDriveConnected(): Promise<{ connected: boolean; email?: string | null }> {
  if (!(await requireAdmin())) return { connected: false }
  const db = adminDb()
  const { data } = await db.from('integrations').select('metadata').eq('provider', 'google_drive').maybeSingle()
  const row = data as { metadata?: { email?: string } } | null
  if (!row) return { connected: false }
  return { connected: true, email: row.metadata?.email ?? null }
}

/**
 * List files inside a client's linked folder. Returns an error string if
 * the folder isn't set or Drive isn't connected.
 */
export async function listClientDriveFiles(clientId: string): Promise<{
  files: DriveFile[]
  error?: string
  folderId?: string | null
  folderUrl?: string | null
}> {
  if (!(await requireAdmin())) return { files: [], error: 'Not authorized' }

  const db = adminDb()
  const { data: client } = await db.from('clients').select('drive_folder_id, drive_folder_url').eq('id', clientId).maybeSingle()
  const c = client as { drive_folder_id: string | null; drive_folder_url: string | null } | null
  if (!c?.drive_folder_id) return { files: [], error: 'No Drive folder linked', folderId: null, folderUrl: null }

  const token = await getValidDriveToken()
  if (!token) return { files: [], error: 'Drive not connected', folderId: c.drive_folder_id, folderUrl: c.drive_folder_url }

  try {
    const files = await listFilesInFolder(token, c.drive_folder_id)
    return { files, folderId: c.drive_folder_id, folderUrl: c.drive_folder_url }
  } catch (e) {
    return { files: [], error: (e as Error).message, folderId: c.drive_folder_id, folderUrl: c.drive_folder_url }
  }
}

/**
 * Link a Drive folder to a client. Accepts either a full URL or a raw
 * folder ID.
 */
export async function linkDriveFolder(clientId: string, input: string): Promise<{
  success: boolean
  error?: string
  folderId?: string
}> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized' }
  const folderId = extractFolderId(input)
  if (!folderId) return { success: false, error: 'Could not parse a Drive folder ID from that input' }

  const db = adminDb()
  const url = input.includes('drive.google.com') ? input : `https://drive.google.com/drive/folders/${folderId}`
  const { error } = await db.from('clients').update({
    drive_folder_id: folderId,
    drive_folder_url: url,
  }).eq('id', clientId)
  if (error) return { success: false, error: error.message }
  return { success: true, folderId }
}

/**
 * Unlink the Drive folder from a client.
 */
export async function unlinkDriveFolder(clientId: string): Promise<{ success: boolean; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized' }
  const db = adminDb()
  const { error } = await db.from('clients').update({
    drive_folder_id: null,
    drive_folder_url: null,
  }).eq('id', clientId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Pull full text content from every Google Doc in the folder. Used by
 * the AI-extract flow (phase 3). Skips non-Doc files.
 */
export async function readClientDocsContent(clientId: string): Promise<{
  docs: Array<{ id: string; name: string; text: string }>
  error?: string
}> {
  if (!(await requireAdmin())) return { docs: [], error: 'Not authorized' }
  const { files, error } = await listClientDriveFiles(clientId)
  if (error) return { docs: [], error }
  const token = await getValidDriveToken()
  if (!token) return { docs: [], error: 'Drive not connected' }

  const docs: Array<{ id: string; name: string; text: string }> = []
  for (const f of files) {
    if (f.mimeType !== 'application/vnd.google-apps.document') continue
    const text = await exportGoogleDocAsText(token, f.id)
    if (text) docs.push({ id: f.id, name: f.name, text })
  }
  return { docs }
}
