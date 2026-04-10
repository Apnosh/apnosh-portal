'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GlobalAssetType } from '@/types/database'

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

async function resolveClientId(): Promise<{ clientId: string; clientUserId: string | null } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cu } = await supabase
    .from('client_users')
    .select('id, client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (cu) return { clientId: cu.client_id, clientUserId: cu.id }

  const { data: biz } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (biz?.client_id) return { clientId: biz.client_id, clientUserId: null }

  return null
}

// ── Folders ──────────────────────────────────────────────────

export async function createAssetFolder(
  name: string,
  parentFolderId?: string | null,
): Promise<ActionResult<{ folderId: string }>> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }
  if (!name.trim()) return { success: false, error: 'Folder name is required' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('asset_folders')
    .insert({
      client_id: ctx.clientId,
      name: name.trim(),
      parent_folder_id: parentFolderId || null,
      created_by_client: true,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/assets')
  return { success: true, data: { folderId: data.id } }
}

export async function renameAssetFolder(
  folderId: string,
  newName: string,
): Promise<ActionResult> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('asset_folders')
    .update({ name: newName.trim() })
    .eq('id', folderId)
    .eq('client_id', ctx.clientId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/assets')
  return { success: true }
}

export async function deleteAssetFolder(folderId: string): Promise<ActionResult> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  // Move assets in this folder to root (folder_id = null) before deleting
  await admin
    .from('assets')
    .update({ folder_id: null })
    .eq('folder_id', folderId)
    .eq('client_id', ctx.clientId)

  const { error } = await admin
    .from('asset_folders')
    .delete()
    .eq('id', folderId)
    .eq('client_id', ctx.clientId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/assets')
  return { success: true }
}

// ── Assets ──────────────────────────────────────────────────

export async function createAsset(data: {
  name: string
  type: GlobalAssetType
  fileUrl?: string | null
  fileSize?: number | null
  mimeType?: string | null
  dimensions?: string | null
  content?: string | null  // for text snippets
  folderId?: string | null
  tags?: string[]
}): Promise<ActionResult<{ assetId: string }>> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('assets')
    .insert({
      client_id: ctx.clientId,
      name: data.name.trim(),
      type: data.type,
      file_url: data.fileUrl ?? null,
      file_size: data.fileSize ?? null,
      mime_type: data.mimeType ?? null,
      dimensions: data.dimensions ?? null,
      content: data.content ?? null,
      folder_id: data.folderId ?? null,
      tags: data.tags ?? [],
      uploaded_by_client: true,
      uploaded_by_client_user: ctx.clientUserId,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/assets')
  return { success: true, data: { assetId: row.id } }
}

export async function updateAsset(
  assetId: string,
  updates: {
    name?: string
    tags?: string[]
    folderId?: string | null
  },
): Promise<ActionResult> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (updates.name !== undefined) patch.name = updates.name.trim()
  if (updates.tags !== undefined) patch.tags = updates.tags
  if (updates.folderId !== undefined) patch.folder_id = updates.folderId

  const { error } = await admin
    .from('assets')
    .update(patch)
    .eq('id', assetId)
    .eq('client_id', ctx.clientId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/assets')
  return { success: true }
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  const ctx = await resolveClientId()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  // Get file URL to delete from storage
  const { data: asset } = await admin
    .from('assets')
    .select('file_url, uploaded_by_client, client_id')
    .eq('id', assetId)
    .single()

  if (!asset) return { success: false, error: 'Asset not found' }
  if (asset.client_id !== ctx.clientId) return { success: false, error: 'Not your asset' }

  // Check permission: clients can only delete their own uploads
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin && !asset.uploaded_by_client) {
    return { success: false, error: 'You can only delete files you uploaded' }
  }

  // Delete from storage if it's a Supabase URL
  if (asset.file_url && asset.file_url.includes('supabase')) {
    try {
      const urlPath = new URL(asset.file_url).pathname
      const storagePath = urlPath.split('/object/public/client-assets/')[1]
      if (storagePath) {
        await admin.storage.from('client-assets').remove([storagePath])
      }
    } catch { /* best effort */ }
  }

  const { error } = await admin.from('assets').delete().eq('id', assetId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/assets')
  return { success: true }
}

export async function createTextSnippet(data: {
  name: string
  content: string
  folderId?: string | null
  tags?: string[]
}): Promise<ActionResult<{ assetId: string }>> {
  return createAsset({
    name: data.name,
    type: 'text',
    content: data.content,
    folderId: data.folderId,
    tags: data.tags,
  })
}
