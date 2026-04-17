'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ClientUserRole, TemplateType, PostPlatform, PostSize, FeedbackType,
  ServiceArea, ContentFormat, ClientAllotments, QueueStatus,
} from '@/types/database'

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

  // Ensure CRM profile exists before creating user link
  const { ensureClientProfile } = await import('@/lib/crm-sync')
  await ensureClientProfile(clientId)

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
  serviceArea?: ServiceArea
  contentFormat?: ContentFormat | null
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
      service_area: data.serviceArea || 'social',
      content_format: data.contentFormat || null,
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
// submitGraphicRequest — multi-step wizard submission for static graphics
// Creates BOTH a content_queue row (for the existing approval/draft pipeline)
// AND a graphic_requests row (for the structured wizard data).
// ---------------------------------------------------------------------------

export interface GraphicRequestPayload {
  content_type: string
  // Detail fields (only the relevant ones for content_type are populated)
  offer_text?: string | null
  promo_code?: string | null
  offer_expiry?: string | null
  price_display?: string | null
  product_name?: string | null
  product_desc?: string | null
  product_price?: string | null
  product_status?: string | null
  event_name?: string | null
  event_date?: string | null
  event_time?: string | null
  event_location?: string | null
  event_ticket_info?: string | null
  season_name?: string | null
  season_message?: string | null
  season_offer?: string | null
  edu_topic?: string | null
  edu_key_points?: string | null
  testimonial_quote?: string | null
  testimonial_name?: string | null
  testimonial_source?: string | null

  placement?: string | null
  carousel_slide_count?: number | null
  custom_dim_mode?: string | null
  custom_ratio?: string | null
  custom_width?: number | null
  custom_height?: number | null
  custom_unit?: string | null
  custom_dpi?: number | null

  publish_date?: string | null
  urgency?: string | null

  main_message?: string | null
  headline_text?: string | null
  call_to_action?: string[] | null
  post_caption?: string | null

  uploaded_asset_urls?: string[]
  source_stock_photo?: boolean
  include_logo?: boolean

  mood_tags?: string[]
  color_preference?: string | null
  reference_link?: string | null
  reference_asset_urls?: string[]

  avoid_colors?: string | null
  avoid_styles?: string | null
  designer_notes?: string | null
  internal_note?: string | null
}

export async function submitGraphicRequest(
  payload: GraphicRequestPayload,
): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_id (same dual path as submitContentRequest)
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

  if (!payload.content_type) {
    return { success: false, error: 'Content type is required' }
  }

  // Build a short summary for content_queue.input_text from the structured fields
  const summary = buildGraphicSummary(payload)

  const admin = createAdminClient()

  // 1. Create the content_queue row
  const { data: queueRow, error: queueErr } = await admin
    .from('content_queue')
    .insert({
      client_id: clientId,
      request_type: 'client_request',
      submitted_by: 'client',
      submitted_by_user_id: clientUserId,
      input_text: summary,
      input_photo_url: payload.uploaded_asset_urls?.[0] ?? null,
      service_area: 'social',
      content_format: 'graphic',
      platform: null,
      // PostSize in content_queue is a dimensional hint ('feed' | 'square' |
      // 'story'); the full placement ('carousel', 'banner', 'custom', etc)
      // is always preserved verbatim on graphic_requests.placement.
      // Map the 6 placements we accept to the closest of the 3 enum values:
      //   story / reel-cover -> 'story'   (9:16 portrait)
      //   carousel           -> 'square'  (IG carousels default to 1:1)
      //   custom + square-ish ratio -> 'square'
      //   feed / banner / other -> 'feed' (general rectangular)
      size: (
        payload.placement === 'story' || payload.placement === 'reel-cover'
          ? 'story'
          : payload.placement === 'carousel'
          ? 'square'
          : payload.placement === 'custom' && payload.custom_ratio === '1:1'
          ? 'square'
          : 'feed'
      ),
      status: 'new',
      drafts: [],
    })
    .select('id')
    .single()

  if (queueErr || !queueRow) {
    return { success: false, error: queueErr?.message || 'Failed to create request' }
  }

  // 2. Create the graphic_requests row
  const { error: graphicErr } = await admin.from('graphic_requests').insert({
    content_queue_id: queueRow.id,
    client_id: clientId,
    submitted_by_user_id: clientUserId,

    content_type: payload.content_type,

    offer_text: payload.offer_text ?? null,
    promo_code: payload.promo_code ?? null,
    offer_expiry: payload.offer_expiry ?? null,
    price_display: payload.price_display ?? null,

    product_name: payload.product_name ?? null,
    product_desc: payload.product_desc ?? null,
    product_price: payload.product_price ?? null,
    product_status: payload.product_status ?? null,

    event_name: payload.event_name ?? null,
    event_date: payload.event_date ?? null,
    event_time: payload.event_time ?? null,
    event_location: payload.event_location ?? null,
    event_ticket_info: payload.event_ticket_info ?? null,

    season_name: payload.season_name ?? null,
    season_message: payload.season_message ?? null,
    season_offer: payload.season_offer ?? null,

    edu_topic: payload.edu_topic ?? null,
    edu_key_points: payload.edu_key_points ?? null,

    testimonial_quote: payload.testimonial_quote ?? null,
    testimonial_name: payload.testimonial_name ?? null,
    testimonial_source: payload.testimonial_source ?? null,

    placement: payload.placement ?? null,
    carousel_slide_count: payload.carousel_slide_count ?? null,
    custom_dim_mode: payload.custom_dim_mode ?? null,
    custom_ratio: payload.custom_ratio ?? null,
    custom_width: payload.custom_width ?? null,
    custom_height: payload.custom_height ?? null,
    custom_unit: payload.custom_unit ?? null,
    custom_dpi: payload.custom_dpi ?? null,

    publish_date: payload.publish_date ?? null,
    urgency: payload.urgency ?? null,

    main_message: payload.main_message ?? null,
    headline_text: payload.headline_text ?? null,
    call_to_action: payload.call_to_action ?? null,
    post_caption: payload.post_caption ?? null,

    uploaded_asset_urls: payload.uploaded_asset_urls ?? [],
    source_stock_photo: payload.source_stock_photo ?? false,
    include_logo: payload.include_logo ?? true,

    mood_tags: payload.mood_tags ?? [],
    color_preference: payload.color_preference ?? null,
    reference_link: payload.reference_link ?? null,
    reference_asset_urls: payload.reference_asset_urls ?? [],

    avoid_colors: payload.avoid_colors ?? null,
    avoid_styles: payload.avoid_styles ?? null,
    designer_notes: payload.designer_notes ?? null,
    internal_note: payload.internal_note ?? null,
  })

  if (graphicErr) {
    // Rollback the queue row so we don't end up with an orphan
    await admin.from('content_queue').delete().eq('id', queueRow.id)
    return { success: false, error: graphicErr.message }
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
        title: 'New graphic request',
        body: summary.slice(0, 120),
        link: `/admin/clients/${slug}?tab=queue`,
      }))
    )
  }

  revalidatePath('/admin/queue')
  revalidatePath('/admin/clients')
  return { success: true, data: { requestId: queueRow.id } }
}

function buildGraphicSummary(p: GraphicRequestPayload): string {
  const TYPE_LABEL: Record<string, string> = {
    promo: 'Promotion / offer',
    product: 'New product',
    event: 'Event',
    seasonal: 'Seasonal',
    educational: 'Educational tip',
    testimonial: 'Testimonial',
    bts: 'Behind the scenes',
    brand: 'Brand awareness',
    other: 'Custom request',
  }
  const label = TYPE_LABEL[p.content_type] || 'Graphic request'
  const detail =
    p.offer_text ||
    p.product_name ||
    p.event_name ||
    p.season_name ||
    p.edu_topic ||
    p.testimonial_quote ||
    p.main_message ||
    ''
  return detail ? `${label} — ${detail}` : label
}

// ---------------------------------------------------------------------------
// submitVideoRequest — multi-step wizard submission for short-form video
// Mirrors submitGraphicRequest. Creates a content_queue row + a video_requests
// row with all the structured wizard data.
// ---------------------------------------------------------------------------

export interface VideoRequestPayload {
  content_type: string
  is_series?: boolean
  series_episode_count?: number | null

  main_message?: string | null
  hook?: string | null
  call_to_action?: string[]
  length_preference?: string | null
  script_owner?: string | null
  script_style?: string | null
  voiceover_tone?: string | null
  footage_source?: string | null

  shoot_location?: string | null
  shoot_date?: string | null
  shoot_flexible?: boolean | null
  shoot_subject?: string | null
  shoot_who_on_camera?: string | null

  music_owner?: string | null
  music_feel?: string | null
  mood_tags?: string[]
  editing_style?: string | null
  reference_link?: string | null
  avoid_text?: string | null
  platforms?: string[]

  publish_date?: string | null
  urgency?: string | null

  reference_asset_urls?: string[]
  internal_note?: string | null
}

export async function submitVideoRequest(
  payload: VideoRequestPayload,
): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_id (same dual path as graphic submit)
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

  if (!payload.content_type) {
    return { success: false, error: 'Content type is required' }
  }

  const summary = buildVideoSummary(payload)
  const admin = createAdminClient()

  // 1. Create content_queue row
  const { data: queueRow, error: queueErr } = await admin
    .from('content_queue')
    .insert({
      client_id: clientId,
      request_type: 'client_request',
      submitted_by: 'client',
      submitted_by_user_id: clientUserId,
      input_text: summary,
      service_area: 'social',
      content_format: 'short_form_video',
      platform: null,
      size: 'story',
      status: 'new',
      drafts: [],
    })
    .select('id')
    .single()

  if (queueErr || !queueRow) {
    return { success: false, error: queueErr?.message || 'Failed to create request' }
  }

  // 2. Create video_requests row
  const { error: videoErr } = await admin.from('video_requests').insert({
    content_queue_id: queueRow.id,
    client_id: clientId,
    submitted_by_user_id: clientUserId,

    content_type: payload.content_type,
    is_series: payload.is_series ?? false,
    series_episode_count: payload.is_series ? (payload.series_episode_count ?? null) : null,

    main_message: payload.main_message ?? null,
    hook: payload.hook ?? null,
    call_to_action: payload.call_to_action ?? [],
    length_preference: payload.length_preference ?? null,
    script_owner: payload.script_owner ?? null,
    script_style: payload.script_style ?? null,
    voiceover_tone: payload.voiceover_tone ?? null,
    footage_source: payload.footage_source ?? null,

    shoot_location: payload.shoot_location ?? null,
    shoot_date: payload.shoot_date ?? null,
    shoot_flexible: payload.shoot_flexible ?? null,
    shoot_subject: payload.shoot_subject ?? null,
    shoot_who_on_camera: payload.shoot_who_on_camera ?? null,

    music_owner: payload.music_owner ?? null,
    music_feel: payload.music_feel ?? null,
    mood_tags: payload.mood_tags ?? [],
    editing_style: payload.editing_style ?? null,
    reference_link: payload.reference_link ?? null,
    avoid_text: payload.avoid_text ?? null,
    platforms: payload.platforms ?? [],

    publish_date: payload.publish_date ?? null,
    urgency: payload.urgency ?? null,

    reference_asset_urls: payload.reference_asset_urls ?? [],
    internal_note: payload.internal_note ?? null,
  })

  if (videoErr) {
    await admin.from('content_queue').delete().eq('id', queueRow.id)
    return { success: false, error: videoErr.message }
  }

  // Notify all admins
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  if (admins && admins.length > 0) {
    await admin.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        type: 'content_request',
        title: 'New short-form video request',
        body: summary.slice(0, 120),
        link: `/admin/clients/${slug}?tab=queue`,
      }))
    )
  }

  revalidatePath('/admin/queue')
  revalidatePath('/admin/clients')
  return { success: true, data: { requestId: queueRow.id } }
}

function buildVideoSummary(p: VideoRequestPayload): string {
  const TYPE_LABEL: Record<string, string> = {
    promo: 'Promo reel',
    product: 'Product reel',
    event: 'Event reel',
    seasonal: 'Seasonal reel',
    educational: 'Educational reel',
    testimonial: 'Testimonial reel',
    bts: 'BTS reel',
    brand: 'Brand reel',
    other: 'Custom reel',
  }
  const label = TYPE_LABEL[p.content_type] || 'Video request'
  const detail = p.main_message || p.hook || ''
  const series = p.is_series && p.series_episode_count
    ? ` (series of ${p.series_episode_count})` : ''
  return detail ? `${label}${series} — ${detail}` : `${label}${series}`
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
// confirmContentRequest — admin confirms a freshly submitted request
// (transitions status: new → confirmed) and notifies the client.
// ---------------------------------------------------------------------------

export async function confirmContentRequest(queueId: string): Promise<ActionResult> {
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

  const { data: queueItem, error: fetchErr } = await admin
    .from('content_queue')
    .select('client_id, status, input_text')
    .eq('id', queueId)
    .single()

  if (fetchErr || !queueItem) {
    return { success: false, error: 'Request not found' }
  }

  if (queueItem.status !== 'new') {
    return { success: false, error: `Request is already ${queueItem.status}` }
  }

  const { error: updateErr } = await admin
    .from('content_queue')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId)

  if (updateErr) return { success: false, error: updateErr.message }

  // Notify the client (both portal types)
  const recipientIds = new Set<string>()

  const { data: cuRows } = await admin
    .from('client_users')
    .select('auth_user_id')
    .eq('client_id', queueItem.client_id)
    .not('auth_user_id', 'is', null)
  for (const u of cuRows ?? []) if (u.auth_user_id) recipientIds.add(u.auth_user_id)

  const { data: bizRows } = await admin
    .from('businesses')
    .select('owner_id')
    .eq('client_id', queueItem.client_id)
  for (const b of bizRows ?? []) if (b.owner_id) recipientIds.add(b.owner_id)

  if (recipientIds.size > 0) {
    await admin.from('notifications').insert(
      Array.from(recipientIds).map(uid => ({
        user_id: uid,
        type: 'request_confirmed',
        title: 'Your request was confirmed',
        body: `We received your request and our team is queuing it up. You'll hear from us when the draft is ready.`,
        link: `/dashboard/social/requests/${queueId}`,
      }))
    )
  }

  revalidatePath('/admin/queue')
  revalidatePath('/admin/clients')
  return { success: true }
}

// ---------------------------------------------------------------------------
// cancelContentRequest — client (or admin) cancels a request
// ---------------------------------------------------------------------------

export async function cancelContentRequest(
  queueId: string,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_id
  let clientId: string | null = null

  const { data: clientUser } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (clientUser) {
    clientId = clientUser.client_id
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (business?.client_id) clientId = business.client_id
  }

  // Admin can cancel any request; client can only cancel their own
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  if (!clientId && !isAdmin) {
    return { success: false, error: 'No client linked to your account' }
  }

  const admin = createAdminClient()

  const { data: queueItem } = await admin
    .from('content_queue')
    .select('client_id, status, input_text, clients(slug)')
    .eq('id', queueId)
    .single()

  if (!queueItem) return { success: false, error: 'Request not found' }

  if (!isAdmin && queueItem.client_id !== clientId) {
    return { success: false, error: 'You can only cancel your own requests' }
  }

  // Block cancellation of already-completed work
  if (['posted', 'cancelled'].includes(queueItem.status)) {
    return { success: false, error: `Request is already ${queueItem.status}` }
  }

  const { error } = await admin
    .from('content_queue')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId)

  if (error) return { success: false, error: error.message }

  // Notify the other side (admin if client cancelled, client if admin cancelled)
  if (isAdmin) {
    // Notify client portal users
    const recipientIds = new Set<string>()
    const { data: cuRows } = await admin
      .from('client_users')
      .select('auth_user_id')
      .eq('client_id', queueItem.client_id)
      .not('auth_user_id', 'is', null)
    for (const u of cuRows ?? []) if (u.auth_user_id) recipientIds.add(u.auth_user_id)

    const { data: bizRows } = await admin
      .from('businesses')
      .select('owner_id')
      .eq('client_id', queueItem.client_id)
    for (const b of bizRows ?? []) if (b.owner_id) recipientIds.add(b.owner_id)

    if (recipientIds.size > 0) {
      await admin.from('notifications').insert(
        Array.from(recipientIds).map(uid => ({
          user_id: uid,
          type: 'request_cancelled',
          title: 'Your request was cancelled',
          body: reason || (queueItem.input_text || '').slice(0, 120),
          link: `/dashboard/social/requests/${queueId}`,
        }))
      )
    }
  } else {
    // Notify all admins
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
    const biz = Array.isArray(queueItem.clients) ? queueItem.clients[0] : queueItem.clients
    const slug = (biz as { slug?: string } | null)?.slug
    if (admins && admins.length > 0) {
      await admin.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id,
          type: 'request_cancelled',
          title: 'Client cancelled a request',
          body: reason || (queueItem.input_text || '').slice(0, 120),
          link: `/admin/clients/${slug}?tab=queue`,
        }))
      )
    }
  }

  revalidatePath('/dashboard/social/requests')
  revalidatePath('/admin/queue')
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
    .select('client_id, input_text, status, revision_count, revision_limit, service_area, clients(slug, services_active)')
    .eq('id', queueId)
    .single()

  if (!queueItem || queueItem.client_id !== clientId) {
    return { success: false, error: 'Request not found' }
  }

  // Enforce revision limit BEFORE writing anything
  if (feedbackType === 'revision') {
    if ((queueItem.revision_count ?? 0) >= (queueItem.revision_limit ?? 2)) {
      return {
        success: false,
        error: `You've reached the limit of ${queueItem.revision_limit} revisions for this request. Please approve or message your account manager.`,
      }
    }
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
    // ── Smart auto-route on approval ──
    // If we manage the client's social media AND this is a social request
    // with a publish_date on the graphic brief, auto-move to 'scheduled'
    // with scheduled_for set to the publish date. Otherwise stay 'approved'
    // (file delivery / admin takes over manually).
    let nextStatus: QueueStatus = 'approved'
    let scheduledFor: string | null = null

    const bizRow = Array.isArray(queueItem.clients) ? queueItem.clients[0] : queueItem.clients
    const servicesActive: string[] = (bizRow as { services_active?: string[] } | null)?.services_active ?? []
    const managesSocial = servicesActive.some(s =>
      ['social media', 'social', 'social media management', 'content'].includes(s.trim().toLowerCase())
    )

    if (managesSocial && queueItem.service_area === 'social') {
      // Look up the publish_date from graphic_requests (if any)
      const { data: brief } = await admin
        .from('graphic_requests')
        .select('publish_date')
        .eq('content_queue_id', queueId)
        .maybeSingle()

      if (brief?.publish_date) {
        nextStatus = 'scheduled'
        // Use noon local of the publish date as the schedule stamp
        scheduledFor = new Date(`${brief.publish_date}T12:00:00`).toISOString()
      }
    }

    const approvalUpdate: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }
    if (scheduledFor) approvalUpdate.scheduled_for = scheduledFor

    await admin.from('content_queue').update(approvalUpdate).eq('id', queueId)
  } else if (feedbackType === 'revision') {
    // Bump revision counter and reset to drafting
    await admin
      .from('content_queue')
      .update({
        status: 'drafting',
        revision_count: (queueItem.revision_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
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
  revalidatePath(`/dashboard/social`)
  revalidatePath(`/admin/queue`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// getAllotmentUsage — returns counts per service area for the current month
// ---------------------------------------------------------------------------

export async function getAllotmentUsage(): Promise<
  ActionResult<{
    clientId: string
    allotments: ClientAllotments
    usage: Record<ServiceArea, number>
  }>
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_id via business link
  let clientId: string | null = null

  const { data: clientUser } = await supabase
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (clientUser) {
    clientId = clientUser.client_id
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (business?.client_id) clientId = business.client_id
  }

  if (!clientId) return { success: false, error: 'No client linked' }

  // Fetch allotments
  const { data: client } = await supabase
    .from('clients')
    .select('allotments')
    .eq('id', clientId)
    .single()

  const allotments = (client?.allotments ?? {}) as ClientAllotments

  // Count requests this month per service_area
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: rows } = await supabase
    .from('content_queue')
    .select('service_area')
    .eq('client_id', clientId)
    .gte('created_at', startOfMonth)

  const usage: Record<ServiceArea, number> = {
    social: 0,
    website: 0,
    local_seo: 0,
    email_sms: 0,
  }
  for (const r of rows ?? []) {
    const sa = (r as { service_area: ServiceArea }).service_area
    if (sa && usage[sa] != null) usage[sa]++
  }

  return { success: true, data: { clientId, allotments, usage } }
}

// ---------------------------------------------------------------------------
// updateClientAllotments — admin-only: set monthly allotments per client
// ---------------------------------------------------------------------------

export async function updateClientAllotments(
  clientId: string,
  allotments: ClientAllotments,
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

  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({ allotments })
    .eq('id', clientId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/clients`)
  revalidatePath(`/dashboard`)
  return { success: true }
}
