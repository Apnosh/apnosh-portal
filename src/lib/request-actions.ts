'use server'

import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface RequestPayload {
  mode: 'quick' | 'template' | 'detailed'
  description: string
  templateType?: string
  photoUrl?: string
  urgency?: string
  deadline?: string
  platforms?: string[]
  detail?: Record<string, unknown>
}

export async function submitContentRequest(payload: RequestPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Resolve client_id
  const { data: biz } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  let clientId = biz?.client_id
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = cu?.client_id
  }
  if (!clientId) return { success: false, error: 'No client account found' }

  const { data: row, error } = await supabase
    .from('content_queue')
    .insert({
      client_id: clientId,
      request_type: 'client_request',
      submitted_by: 'client',
      submitted_by_user_id: user.id,
      service_area: 'social',
      content_format: payload.templateType || 'general',
      input_text: payload.description,
      input_photo_url: payload.photoUrl || null,
      template_type: payload.templateType || null,
      platform: payload.platforms?.join(', ') || null,
      status: 'new',
      scheduled_for: payload.deadline || null,
      drafts: payload.detail ? { ...payload.detail, mode: payload.mode, urgency: payload.urgency } : { mode: payload.mode, urgency: payload.urgency },
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  // For quick mode, expand the brief using AI in the background
  if (payload.mode === 'quick' && row) {
    expandQuickRequest(row.id, payload.description, clientId).catch(console.error)
  }

  return { success: true, requestId: row?.id }
}

async function expandQuickRequest(requestId: string, description: string, clientId: string) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      temperature: 0.5,
      messages: [{
        role: 'user',
        content: `A business owner submitted this content request: "${description}"

Based on this, create a brief for the production team. Return a JSON object with:
- content_type: "graphic" or "video" (best guess)
- headline: a catchy headline for the post
- caption_direction: what the caption should say
- visual_direction: what the image/video should show
- mood: the vibe (bold, warm, clean, playful, professional)
- platforms: ["Instagram", "Facebook"] (best guess for this type of content)
- notes: any additional context for the production team

Return ONLY the JSON object. No markdown.`
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    let expanded = {}
    try { expanded = JSON.parse(text) } catch { expanded = { notes: text } }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    await admin
      .from('content_queue')
      .update({ drafts: { mode: 'quick', expanded, original: description } })
      .eq('id', requestId)
  } catch (err) {
    console.error('[expandQuickRequest]', err)
  }
}
