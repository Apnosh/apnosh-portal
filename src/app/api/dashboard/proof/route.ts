/**
 * Proof cards for one client.
 *
 * GET: the newest live card — from proof_cards when migrated (fired within
 * 7 days, not dismissed), else computed on-read as the fallback so the card
 * works before migration 249 lands. `?list=1` returns the archive (newest
 * first) for the Results page.
 * POST: { id, action: 'read' | 'dismiss' } — cross-device state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evalGbpWeek, computeStateCards } from '@/lib/proof/compose'
import { presentCardType } from '@/lib/proof/present'

export const dynamic = 'force-dynamic'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function iso(d: Date): string { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
  if (!isAdmin) {
    const { data: cu } = await adminDb()
      .from('client_users').select('client_id')
      .eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin0 = adminDb()
  const wantList = new URL(req.url).searchParams.get('list') === '1'
  const wantState = new URL(req.url).searchParams.get('state') === '1'

  // Table-first: fired cards are the source of truth once migration 249 ran.
  {
    const weekAgo = new Date(); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
    const q = admin0
      .from('proof_cards')
      .select('id, card_key, card_type, label, big, context, attribution, spark, is_sample, fired_at, read_at, dismissed_at')
      .eq('client_id', clientId)
      .order('fired_at', { ascending: false })
    const { data: cards, error } = wantList ? await q.limit(60) : await q.is('dismissed_at', null).gte('fired_at', weekAgo.toISOString()).limit(1)
    if (!error) {
      if (wantList) {
        const stored = (cards ?? []).map((c) => ({ ...c, ...presentCardType(String(c.card_type)) }))
        if (!wantState) return NextResponse.json({ cards: stored }, { headers: { 'Cache-Control': 'no-store' } })
        const states = (await computeStateCards(admin0, clientId, new Date()).catch(() => []))
          .map((c) => ({ ...c, id: c.card_key, fired_at: new Date().toISOString(), is_state: true, ...presentCardType(c.card_type) }))
        return NextResponse.json({ cards: [...stored, ...states] }, { headers: { 'Cache-Control': 'no-store' } })
      }
      const c = cards?.[0]
      if (!c) return NextResponse.json({ card: null }, { headers: { 'Cache-Control': 'no-store' } })
      return NextResponse.json({
        card: {
          id: c.card_key, rowId: c.id, label: c.label, big: c.big, context: c.context,
          attribution: c.attribution ?? undefined,
          spark: Array.isArray(c.spark) ? c.spark : undefined,
          firedAt: c.fired_at,
          ...presentCardType(String(c.card_type)),
        },
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
    // Table missing (migration 249 not run): fall through to compute-on-read.
    if (wantList) {
      const states = wantState
        ? (await computeStateCards(admin0, clientId, new Date()).catch(() => []))
            .map((c) => ({ ...c, id: c.card_key, fired_at: new Date().toISOString(), is_state: true, ...presentCardType(c.card_type) }))
        : []
      return NextResponse.json({ cards: states, pending: 'migration 249' }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }

  const live = await evalGbpWeek(admin0, clientId, new Date())
  if (!live) return NextResponse.json({ card: null }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({
    card: { id: live.card_key, label: live.label, big: live.big, context: live.context, attribution: live.attribution, spark: live.spark },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Cross-device card state: mark read (expanded) or dismissed. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { clientId?: string; id?: string; action?: string } | null
  const clientId = body?.clientId ?? ''
  const cardKey = body?.id ?? ''
  const action = body?.action
  if (!clientId || !cardKey || (action !== 'read' && action !== 'dismiss')) {
    return NextResponse.json({ error: 'clientId, id, action required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
  if (!isAdmin) {
    const { data: cu } = await adminDb()
      .from('client_users').select('client_id')
      .eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const patch = action === 'read' ? { read_at: new Date().toISOString() } : { dismissed_at: new Date().toISOString() }
  const { error } = await adminDb()
    .from('proof_cards')
    .update(patch)
    .eq('client_id', clientId)
    .eq('card_key', cardKey)
  // Table missing pre-migration: the client-side localStorage fallback covers dismissal.
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
