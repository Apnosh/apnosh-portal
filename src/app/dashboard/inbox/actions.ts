'use server'

/**
 * Inbox read-state actions.
 *
 * markInboxRead(itemId)  — flips a single row to read
 * markAllInboxRead(ids)  — bulk mark, used by the "Mark all as read"
 *                          menu action
 *
 * The composite item_id format comes from src/lib/dashboard/get-inbox.ts
 * ("deliverable-<uuid>", "review-<uuid>", "task-<uuid>", etc).
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markInboxRead(itemId: string): Promise<{ ok: boolean; error?: string }> {
  if (!itemId) return { ok: false, error: 'Missing item id' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_inbox_read')
    .upsert(
      { user_id: user.id, item_id: itemId, read_at: new Date().toISOString() },
      { onConflict: 'user_id,item_id' },
    )
  if (error) return { ok: false, error: error.message }

  /* No revalidatePath here — the optimistic UI in the row component
     handles the dot disappearance immediately. Server cache is
     refreshed by the next inbox load (force-dynamic page). */
  return { ok: true }
}

export async function markAllInboxRead(itemIds: string[]): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (itemIds.length === 0) return { ok: true, count: 0 }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const rows = itemIds.map(id => ({ user_id: user.id, item_id: id, read_at: now }))

  const { error } = await admin
    .from('user_inbox_read')
    .upsert(rows, { onConflict: 'user_id,item_id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/inbox')
  return { ok: true, count: rows.length }
}
