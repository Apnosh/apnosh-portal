'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClientUserRole, TemplateType, PostPlatform, PostSize, FeedbackType } from '@/types/database'

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

// ---------------------------------------------------------------------------
// inviteClientUser — sends a magic link to a client_user (admin action)
// ---------------------------------------------------------------------------

export async function inviteClientUser(
  clientId: string,
  email: string,
  name: string,
  role: ClientUserRole,
): Promise<ActionResult<{ clientUserId: string }>> {
  const supabase = await createClient()

  // Verify caller is admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Admin access required' }
  }

  const admin = createAdminClient()

  // Upsert the client_users row
  const { data: existing } = await admin
    .from('client_users')
    .select('id')
    .eq('client_id', clientId)
    .ilike('email', email)
    .maybeSingle()

  let clientUserId: string
  if (existing) {
    clientUserId = existing.id
    await admin
      .from('client_users')
      .update({ name: name || null, role, status: 'invited' })
      .eq('id', clientUserId)
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('client_users')
      .insert({
        client_id: clientId,
        email: email.trim().toLowerCase(),
        name: name || null,
        role,
        status: 'invited',
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      return { success: false, error: insertError?.message || 'Failed to create user' }
    }
    clientUserId = inserted.id
  }

  // Send the magic link via signInWithOtp
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { error: otpError } = await admin.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      shouldCreateUser: true,
    },
  })

  if (otpError) {
    return { success: false, error: `Failed to send magic link: ${otpError.message}` }
  }

  revalidatePath(`/admin/clients`)
  return { success: true, data: { clientUserId } }
}

// ---------------------------------------------------------------------------
// submitContentRequest — client submits a new content request
// ---------------------------------------------------------------------------

export async function submitContentRequest(data: {
  description: string
  templateType?: TemplateType | null
  platform?: PostPlatform | null
  size?: PostSize | null
  photoUrl?: string | null
}): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Look up the client_user for this auth user
  const { data: clientUser } = await supabase
    .from('client_users')
    .select('id, client_id, clients(slug)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!clientUser) {
    return { success: false, error: 'No client account linked to this user' }
  }

  if (!data.description.trim()) {
    return { success: false, error: 'Description is required' }
  }

  // Use service role to bypass any timing issues with the inserted notification
  const admin = createAdminClient()

  const { data: inserted, error } = await admin
    .from('content_queue')
    .insert({
      client_id: clientUser.client_id,
      request_type: 'client_request',
      submitted_by: 'client',
      submitted_by_user_id: clientUser.id,
      input_text: data.description.trim(),
      input_photo_url: data.photoUrl || null,
      template_type: data.templateType || null,
      platform: data.platform || null,
      size: data.size || 'feed',
      status: 'new',
      drafts: [],
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { success: false, error: error?.message || 'Failed to submit request' }
  }

  // Notify all admins
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')

  if (admins && admins.length > 0) {
    const biz = Array.isArray(clientUser.clients) ? clientUser.clients[0] : clientUser.clients
    const slug = (biz as { slug?: string } | null)?.slug

    await admin.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        type: 'content_request',
        title: 'New content request',
        body: data.description.trim().slice(0, 120),
        link: `/admin/clients/${slug}?tab=queue`,
      }))
    )
  }

  revalidatePath(`/admin/queue`)
  revalidatePath(`/admin/clients`)
  return { success: true, data: { requestId: inserted.id } }
}

// ---------------------------------------------------------------------------
// uploadDraftContent — admin attaches a finished draft to a queue item
// ---------------------------------------------------------------------------

export async function uploadDraftContent(
  queueId: string,
  data: {
    imageUrl: string
    caption: string
    hashtags: string
    designerNotes?: string
  },
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Admin access required' }
  }

  // Fetch existing drafts
  const { data: queueItem } = await supabase
    .from('content_queue')
    .select('drafts, designer_notes')
    .eq('id', queueId)
    .single()

  if (!queueItem) {
    return { success: false, error: 'Queue item not found' }
  }

  const existingDrafts = Array.isArray(queueItem.drafts) ? queueItem.drafts : []
  const newDraft = {
    image_url: data.imageUrl,
    html_source: '',
    caption: data.caption,
    hashtags: data.hashtags,
  }
  const updatedDrafts = [...existingDrafts, newDraft]

  const { error } = await supabase
    .from('content_queue')
    .update({
      drafts: updatedDrafts,
      selected_draft: updatedDrafts.length - 1,
      designer_notes: data.designerNotes || queueItem.designer_notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/queue`)
  revalidatePath(`/admin/clients`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// sendForReview — admin moves a queue item to in_review and notifies the client
// ---------------------------------------------------------------------------

export async function sendForReview(queueId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Admin access required' }
  }

  const admin = createAdminClient()

  const { data: queueItem, error: fetchError } = await admin
    .from('content_queue')
    .select('client_id, input_text, clients(slug, name)')
    .eq('id', queueId)
    .single()

  if (fetchError || !queueItem) {
    return { success: false, error: 'Queue item not found' }
  }

  const { error } = await admin
    .from('content_queue')
    .update({ status: 'in_review', updated_at: new Date().toISOString() })
    .eq('id', queueId)

  if (error) return { success: false, error: error.message }

  // Notify all client_users for this client
  const { data: clientUsers } = await admin
    .from('client_users')
    .select('auth_user_id')
    .eq('client_id', queueItem.client_id)
    .not('auth_user_id', 'is', null)

  if (clientUsers && clientUsers.length > 0) {
    const biz = Array.isArray(queueItem.clients) ? queueItem.clients[0] : queueItem.clients
    const slug = (biz as { slug?: string } | null)?.slug

    await admin.from('notifications').insert(
      clientUsers
        .filter(u => u.auth_user_id)
        .map(u => ({
          user_id: u.auth_user_id!,
          type: 'content_ready',
          title: 'Content ready for review',
          body: (queueItem.input_text || 'A new draft is ready for your review').slice(0, 120),
          link: `/client/${slug}/requests/${queueId}`,
        }))
    )
  }

  revalidatePath(`/admin/queue`)
  revalidatePath(`/admin/clients`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// submitClientFeedback — client approves or requests revision
// ---------------------------------------------------------------------------

export async function submitClientFeedback(
  queueId: string,
  feedbackType: FeedbackType,
  message?: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_user
  const { data: clientUser } = await supabase
    .from('client_users')
    .select('id, client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!clientUser) {
    return { success: false, error: 'No client account linked to this user' }
  }

  const admin = createAdminClient()

  // Verify the queue item belongs to this client
  const { data: queueItem } = await admin
    .from('content_queue')
    .select('client_id, input_text, clients(slug)')
    .eq('id', queueId)
    .single()

  if (!queueItem || queueItem.client_id !== clientUser.client_id) {
    return { success: false, error: 'Request not found' }
  }

  // Insert feedback
  const { error: feedbackError } = await admin.from('client_feedback').insert({
    content_queue_id: queueId,
    user_id: clientUser.id,
    feedback_type: feedbackType,
    message: message?.trim() || null,
  })

  if (feedbackError) return { success: false, error: feedbackError.message }

  // Update queue status based on feedback type
  if (feedbackType === 'approval') {
    await admin
      .from('content_queue')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', queueId)
  } else if (feedbackType === 'revision') {
    await admin
      .from('content_queue')
      .update({ status: 'drafting', updated_at: new Date().toISOString() })
      .eq('id', queueId)
  }

  // Notify admins
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  if (admins && admins.length > 0) {
    const biz = Array.isArray(queueItem.clients) ? queueItem.clients[0] : queueItem.clients
    const slug = (biz as { slug?: string } | null)?.slug

    const titleMap: Record<FeedbackType, string> = {
      approval: 'Client approved a request',
      revision: 'Client requested a revision',
      comment: 'Client left a comment',
    }

    await admin.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        type: 'client_feedback',
        title: titleMap[feedbackType],
        body: (message || queueItem.input_text || '').slice(0, 120),
        link: `/admin/clients/${slug}?tab=queue`,
      }))
    )
  }

  revalidatePath(`/client`)
  revalidatePath(`/admin/queue`)
  return { success: true }
}
