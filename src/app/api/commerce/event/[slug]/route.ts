/**
 * Webhook for commerce events (orders + reservations) — same
 * pattern as the forms webhook. Any platform (Toast, Square,
 * DoorDash, OpenTable, Resy, Tock) can POST events here:
 *
 *   POST /api/commerce/event/{client-slug}?kind=order&stage=confirmed&source=toast
 *
 * Required query params:
 *   kind   = 'order' | 'reservation'
 *   stage  = 'started' | 'added' | 'submitted' | 'confirmed' | 'cancelled'
 *
 * Optional query params:
 *   source = 'toast' | 'square' | etc.
 *
 * Body is JSON. We pull a few standard fields (external_id,
 * amount_cents, party_size, scheduled_at) and stash the rest in
 * payload. Duplicate events with the same (client, source, kind,
 * stage, external_id) are silently deduped.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_KINDS = new Set(['order', 'reservation'])
const VALID_STAGES = new Set(['started', 'added', 'submitted', 'confirmed', 'cancelled'])

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unknown client' }, { status: 404 })

  const url = new URL(req.url)
  const kind = (url.searchParams.get('kind') || '').toLowerCase()
  const stage = (url.searchParams.get('stage') || '').toLowerCase()
  const source = (url.searchParams.get('source') || '').toLowerCase() || null
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: `kind must be one of ${[...VALID_KINDS].join('|')}` }, { status: 400 })
  }
  if (!VALID_STAGES.has(stage)) {
    return NextResponse.json({ error: `stage must be one of ${[...VALID_STAGES].join('|')}` }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  const ct = req.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      body = await req.json() as Record<string, unknown>
    } else {
      const fd = await req.formData()
      for (const [k, v] of fd.entries()) body[k] = String(v ?? '')
    }
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  /* Pull standard fields out of the payload where they exist. */
  const externalId =
    asStr(body.external_id) ?? asStr(body.id) ?? asStr(body.order_id) ?? asStr(body.reservation_id) ?? null
  const amountCents = asInt(body.amount_cents) ?? (asInt(body.amount) != null ? Math.round(asInt(body.amount)! * 100) : null)
  const partySize = asInt(body.party_size) ?? asInt(body.guests) ?? null
  const scheduledAt = asStr(body.scheduled_at) ?? asStr(body.reservation_time) ?? asStr(body.pickup_time) ?? null

  const { data: row, error } = await admin.from('commerce_events').insert({
    client_id: client.id,
    kind, stage, source,
    external_id: externalId,
    amount_cents: amountCents,
    party_size: partySize,
    scheduled_at: scheduledAt,
    payload: body,
  }).select('id').single()

  if (error) {
    /* Dedupe collisions on the unique index are treated as success. */
    if (error.code === '23505') return NextResponse.json({ ok: true, deduped: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: row?.id })
}

function asStr(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return Math.floor(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return isFinite(n) ? Math.floor(n) : null
  }
  return null
}
