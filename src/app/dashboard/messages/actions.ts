'use server'

/**
 * Messages read-state action.
 *
 * markThreadRead(threadId) — marks every message in the thread that the owner
 * did NOT send as read. Runs through the admin (service-role) client so it
 * isn't blocked by RLS (owners have SELECT/INSERT but no UPDATE grant on
 * messages — same pattern as the Inbox's markInboxRead). Ownership is verified
 * first: the thread's business must belong to the signed-in user, so a user
 * can only clear read state on their own conversations.
 */
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markThreadRead(threadId: string): Promise<{ ok: boolean; error?: string }> {
  if (!threadId) return { ok: false, error: 'Missing thread id' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  // Verify this thread's business belongs to the signed-in owner.
  const { data: thread } = await admin
    .from('message_threads')
    .select('business_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread?.business_id) return { ok: false, error: 'Thread not found' }

  const { data: biz } = await admin
    .from('businesses')
    .select('id')
    .eq('id', thread.business_id as string)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!biz?.id) return { ok: false, error: 'Not your conversation' }

  const { error } = await admin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .neq('sender_id', user.id)
    .is('read_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
