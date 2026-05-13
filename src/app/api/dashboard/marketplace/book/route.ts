/**
 * POST /api/dashboard/marketplace/book
 *
 * Owner requests a one-off booking with a marketplace creator. We
 * write a booking_requests row (status='open') and notify the
 * strategist + onboarder so someone reaches out to the creator and
 * sends a quote back.
 *
 * Per spec: the creator does NOT see the row directly — Apnosh
 * staff mediates the conversation. RLS on booking_requests already
 * scopes reads to the current client; we don't fan out a creator-
 * side notification either.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const VALID_CATEGORY = new Set(['food_influencer', 'photographer', 'videographer', 'other'])
const VALID_COMP = new Set(['paid', 'meal_only', 'meal_plus_pay', 'barter', 'flexible'])

interface Body {
  clientId: string
  creatorId: string
  category: string
  brief: string
  desiredStart?: string | null
  desiredEnd?: string | null
  compType?: string | null
  compDetail?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.clientId || !body?.creatorId || !body?.brief?.trim() || !body?.category) {
    return NextResponse.json({ error: 'clientId, creatorId, category, brief required' }, { status: 400 })
  }
  if (!VALID_CATEGORY.has(body.category)) {
    return NextResponse.json({ error: `invalid category: ${body.category}` }, { status: 400 })
  }
  if (body.compType && !VALID_COMP.has(body.compType)) {
    return NextResponse.json({ error: `invalid comp type: ${body.compType}` }, { status: 400 })
  }
  if (body.brief.length > 2000) {
    return NextResponse.json({ error: 'brief too long (max 2000 chars)' }, { status: 400 })
  }

  // Tenancy gate.
  const { clientId } = await resolveCurrentClient(body.clientId)
  if (clientId !== body.clientId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  /* Confirm the creator is actually bookable. Prevents a fabricated
     creator_id sneaking through (RLS lets clients read bookable rows
     but doesn't prevent them passing arbitrary ids on POST). */
  const { data: creator } = await admin
    .from('creator_profiles')
    .select('person_id, bookable, category')
    .eq('person_id', body.creatorId)
    .maybeSingle()
  if (!creator || !creator.bookable) {
    return NextResponse.json({ error: 'creator not bookable' }, { status: 404 })
  }

  /* Idempotency: if there's already an open booking with the same
     (client, creator, brief), update it rather than create a duplicate
     — but only when the brief matches, since the owner may genuinely
     want two distinct bookings of the same person. */
  const { data: existing } = await admin
    .from('booking_requests')
    .select('id')
    .eq('client_id', body.clientId)
    .eq('creator_id', body.creatorId)
    .eq('brief', body.brief.trim())
    .in('status', ['open', 'in_discussion'])
    .maybeSingle()

  let bookingId: string | null = null
  if (existing) {
    bookingId = existing.id as string
    await admin
      .from('booking_requests')
      .update({
        desired_start: body.desiredStart ?? null,
        desired_end: body.desiredEnd ?? null,
        comp_type: body.compType ?? null,
        comp_detail: body.compDetail ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    const { data: inserted, error } = await admin
      .from('booking_requests')
      .insert({
        client_id: body.clientId,
        creator_id: body.creatorId,
        requested_by: user.id,
        category: body.category,
        brief: body.brief.trim(),
        desired_start: body.desiredStart ?? null,
        desired_end: body.desiredEnd ?? null,
        comp_type: body.compType ?? null,
        comp_detail: body.compDetail ?? null,
        status: 'open',
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    bookingId = inserted?.id ?? null
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'marketplace.booking_requested',
    subject_type: 'booking_request',
    subject_id: bookingId,
    actor_id: user.id,
    actor_role: 'client',
    summary: `Booking request: ${body.category.replace('_', ' ')}`,
    payload: {
      creator_id: body.creatorId,
      category: body.category,
      comp_type: body.compType ?? null,
      has_dates: !!(body.desiredStart || body.desiredEnd),
    },
  })

  await notifyStaffForClient(
    body.clientId,
    ['strategist', 'onboarder', 'community_mgr'],
    {
      kind: 'client_request',
      title: 'New marketplace booking request',
      body: body.brief.slice(0, 140),
      link: `/work/inbox?focus=${bookingId ?? ''}`,
    },
  ).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true, bookingId })
}
