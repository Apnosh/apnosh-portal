/**
 * Tool: post_to_gbp
 *
 * Create a Google Business Profile post (Update / Offer / Event).
 * Routes through the existing client_updates pipeline with target
 * "gbp" -- the daily fanout cron picks up pending rows and posts
 * them via the GBP API.
 *
 * Three GBP post types:
 *   - update: general announcement, plain text + optional photo
 *   - offer: time-bound promotion with coupon code (optional)
 *   - event: dated event with start/end times
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface PostToGbpInput {
  post_type: 'update' | 'offer' | 'event'
  title: string
  body: string
  photo_url?: string
  call_to_action?: {
    type: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL'
    url?: string
  }
  // Offer-specific
  coupon_code?: string
  redemption_url?: string
  // Event-specific
  starts_at?: string             // ISO datetime
  ends_at?: string               // ISO datetime
  location_id?: string           // omit for primary
}

export const POST_TO_GBP_SCHEMA = {
  type: 'object',
  properties: {
    post_type: { type: 'string', enum: ['update', 'offer', 'event'] },
    title: { type: 'string', maxLength: 80 },
    body: { type: 'string', maxLength: 1500 },
    photo_url: { type: 'string', format: 'uri' },
    call_to_action: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'] },
        url: { type: 'string', format: 'uri' },
      },
      required: ['type'],
      additionalProperties: false,
    },
    coupon_code: { type: 'string', maxLength: 60 },
    redemption_url: { type: 'string', format: 'uri' },
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
    location_id: { type: 'string' },
  },
  required: ['post_type', 'title', 'body'],
  additionalProperties: false,
} as const

export interface PostToGbpOutput {
  update_id: string
  location_id: string
  status: 'pending_fanout'
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<PostToGbpOutput> {
  const input = rawInput as PostToGbpInput
  const admin = createAdminClient()

  // Resolve location
  let locationId = input.location_id ?? null
  if (!locationId) {
    const { data: loc } = await admin
      .from('gbp_locations')
      .select('id')
      .eq('client_id', ctx.clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()
    locationId = (loc?.id as string | undefined) ?? null
  }
  if (!locationId) {
    throw new Error('No GBP location connected. Connect one in Local SEO first.')
  }

  // Map our post_type to the client_updates type the fanout pipeline
  // expects. 'promotion' covers update + offer; 'event' has its own.
  const updateType = input.post_type === 'event' ? 'event' : 'promotion'

  const { data: inserted, error } = await admin
    .from('client_updates')
    .insert({
      client_id: ctx.clientId,
      location_id: locationId,
      type: updateType,
      payload: {
        post_type: input.post_type,
        title: input.title,
        body: input.body,
        photo_url: input.photo_url ?? null,
        call_to_action: input.call_to_action ?? null,
        coupon_code: input.coupon_code ?? null,
        redemption_url: input.redemption_url ?? null,
        starts_at: input.starts_at ?? null,
        ends_at: input.ends_at ?? null,
      },
      targets: ['gbp'],
      summary: input.title,
      status: 'pending',
      source: 'ai_agent',
      approval_required: false,
    })
    .select('id')
    .single()
  if (error || !inserted) throw new Error(`Failed to create GBP post: ${error?.message}`)

  return {
    update_id: inserted.id as string,
    location_id: locationId,
    status: 'pending_fanout',
  }
}

registerToolHandler('postToGbp', handler as never)
