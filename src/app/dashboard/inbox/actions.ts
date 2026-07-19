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

/**
 * replyToReview — owner SAVES a reply to a customer review from the Inbox.
 * Records the response on the review (response_text + responded_at) so it
 * shows as replied. Posting publicly to Google goes through
 * /api/dashboard/reviews/[id]/reply (the review page uses it for Google
 * reviews); this action only records — callers must never say "Posted".
 *
 * Ownership: the review must belong to the caller's own client. Without
 * this check, any logged-in user who learned a review UUID could write a
 * reply onto another restaurant's review.
 */
export async function replyToReview(reviewId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const body = text.trim()
  if (!reviewId || !body) return { ok: false, error: 'Missing review or reply' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  // Resolve the caller's client (owner via businesses, or a linked client_users row).
  const [bizRes, cuRes] = await Promise.all([
    admin.from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle(),
    admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle(),
  ])
  const myClientId = (bizRes.data?.client_id as string | null) ?? (cuRes.data?.client_id as string | null)
  if (!myClientId) return { ok: false, error: 'No business found for this account' }

  const { data: review } = await admin
    .from('reviews')
    .select('id, client_id')
    .eq('id', reviewId)
    .maybeSingle()
  if (!review || review.client_id !== myClientId) return { ok: false, error: 'Review not found' }

  const { error } = await admin
    .from('reviews')
    .update({ response_text: body, responded_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * startStrategistThread — first-message bootstrap for the Inbox Messages tab.
 * Owners with no existing thread get one ("Your strategist") created with their
 * first message. Returns the new thread id so the client can keep sending via
 * the existing sendMessage(threadId, content) action.
 */
export async function startStrategistThread(text: string): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const body = text.trim()
  if (!body) return { ok: false, error: 'Empty message' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
  if (!biz?.id) return { ok: false, error: 'No business found for this account' }

  const { data: profile } = await admin.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
  const { data: thread, error: tErr } = await admin
    .from('message_threads')
    .insert({ business_id: biz.id, subject: 'Your strategist', last_message_at: new Date().toISOString() })
    .select('id')
    .single()
  if (tErr || !thread) return { ok: false, error: tErr?.message ?? 'Could not start the thread' }

  const { error: mErr } = await admin.from('messages').insert({
    business_id: biz.id, thread_id: thread.id, sender_id: user.id,
    sender_name: (profile?.full_name as string) ?? 'Owner', sender_role: (profile?.role as string) ?? 'client',
    content: body, attachments: [],
  })
  if (mErr) return { ok: false, error: mErr.message }
  return { ok: true, threadId: thread.id as string }
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
