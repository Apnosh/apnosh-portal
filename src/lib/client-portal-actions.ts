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

  // Resolve client_id: first try client_users (new portal), then via business (dashboard portal)
  let clientId: string | null = null
  let clientUserId: string | null = null
  let slug: string | undefined

  const { data: clientUser } = await supabase
    .from('client_users')
    .select('id, client_id, clients(slug)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (clientUser) {
    clientId = clientUser.client_id
    clientUserId = clientUser.id
    const biz = Array.isArray(clientUser.clients) ? clientUser.clients[0] : clientUser.clients
    slug = (biz as { slug?: string } | null)?.slug
  } else {
    // Dashboard user path: find their business and its linked client
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id, clients(slug)')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (business?.client_id) {
      clientId = business.client_id
      const biz = Array.isArray(business.clients) ? business.clients[0] : business.clients
      slug = (biz as { slug?: string } | null)?.slug
    }
  }

  if (!clientId) {
    return { success: false, error: 'No client linked to your account. Contact support.' }
  }

  if (!data.description.trim()) {
    return { success: false, error: 'Description is required' }
  }

  // Use service role to bypass any timing issues with the inserted notification
  const admin = createAdminClient()

  const { data: inserted, error } = await admin
    .from('content_queue')
    .insert({
      client_id: clientId,
      request_type: 'client_request',
      submitted_by: 'client',
      submitted_by_user_id: clientUserId,
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
  // Notify client_users (new portal) + businesses linked to this client (dashboard portal)
  const recipientIds = new Set<string>()

  const { data: clientUsers } = await admin
    .from('client_users')
    .select('auth_user_id')
    .eq('client_id', queueItem.client_id)
    .not('auth_user_id', 'is', null)

  for (const u of clientUsers ?? []) {
    if (u.auth_user_id) recipientIds.add(u.auth_user_id)
  }

  const { data: linkedBusinesses } = await admin
    .from('businesses')
    .select('owner_id')
    .eq('client_id', queueItem.client_id)

  for (const b of linkedBusinesses ?? []) {
    if (b.owner_id) recipientIds.add(b.owner_id)
  }

  if (recipientIds.size > 0) {
    await admin.from('notifications').insert(
      Array.from(recipientIds).map(uid => ({
        user_id: uid,
        type: 'content_ready',
        title: 'Content ready for review',
        body: (queueItem.input_text || 'A new draft is ready for your review').slice(0, 120),
        link: `/dashboard/requests/${queueId}`,
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

  // Resolve client_id: try client_users first, then fall back to business link
  let clientId: string | null = null
  let clientUserId: string | null = null

  const { data: clientUser } = await supabase
    .from('client_users')
    .select('id, client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (clientUser) {
    clientId = clientUser.client_id
    clientUserId = clientUser.id
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (business?.client_id) {
      clientId = business.client_id
    }
  }

  if (!clientId) {
    return { success: false, error: 'No client linked to your account' }
  }

  const admin = createAdminClient()

  // Verify the queue item belongs to this client
  const { data: queueItem } = await admin
    .from('content_queue')
    .select('client_id, input_text, clients(slug)')
    .eq('id', queueId)
    .single()

  if (!queueItem || queueItem.client_id !== clientId) {
    return { success: false, error: 'Request not found' }
  }

  // Insert feedback
  const { error: feedbackError } = await admin.from('client_feedback').insert({
    content_queue_id: queueId,
    user_id: clientUserId,
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

  revalidatePath(`/dashboard/requests`)
  revalidatePath(`/admin/queue`)
  return { success: true }
}
