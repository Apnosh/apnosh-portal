/**
 * Proof cards for one client.
 *
 * GET: the newest live card — from proof_cards when migrated (fired within
 * 7 days, not dismissed), else computed on-read as the fallback so the card
 * works before migration 249 lands. `?list=1` returns the archive (newest
 * first) for the Results page.
 * POST: { id, action: 'read' | 'open' | 'dismiss' | 'share' } — cross-device state.
 *   read    the card reached the front of the deck (it was in front of them)
 *   open    they tapped into it (the card's link) — the mark that says a win landed
 *   share   they sent it somewhere (no share button yet; the column is ready for one)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { userMayReadClient } from '@/lib/auth/client-access'
import { evalGbpWeek, computeStateCards } from '@/lib/proof/compose'
import { presentCardType } from '@/lib/proof/present'
import { isStaffRole } from '@/lib/auth/roles'

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
  const isAdmin = isStaffRole(profile?.role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin0 = adminDb()
  const wantList = new URL(req.url).searchParams.get('list') === '1'
  const wantState = new URL(req.url).searchParams.get('state') === '1'

  // Table-first: fired cards are the source of truth once migration 249 ran.
  {
    const weekAgo = new Date(); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
    const COLS = 'id, card_key, card_type, label, big, context, attribution, spark, is_sample, fired_at, read_at, dismissed_at'
    // metadata (migration 262) carries the key + numbers a counted card is re-drawn from, so the
    // shelf can render it in the owner's language. A database without the column must still
    // answer, so the read is asked again without it rather than falling through to the
    // computed-on-read card and quietly losing every stored one.
    const read = (cols: string) => {
      const q = admin0
        .from('proof_cards')
        .select(cols)
        .eq('client_id', clientId)
        .order('fired_at', { ascending: false })
      return wantList ? q.limit(60) : q.is('dismissed_at', null).gte('fired_at', weekAgo.toISOString()).limit(1)
    }
    let res = await read(`${COLS}, metadata`)
    if (res.error?.code === '42703') res = await read(COLS)
    const { data: cardRows, error } = res
    const cards = (cardRows ?? []) as unknown as Record<string, unknown>[]
    if (!error) {
      if (wantList) {
        const stored: Record<string, unknown>[] = (cards ?? []).map((c) => ({ ...c, ...presentCardType(String(c.card_type)) }))
        if (!wantState) return NextResponse.json({ cards: stored }, { headers: { 'Cache-Control': 'no-store' } })
        // The deck is the present tense: events older than 14 days live in the archive only.
        const fresh = stored.filter((c) => new Date(String(c.fired_at)).getTime() > Date.now() - 14 * 86400e3)
        const states = (await computeStateCards(admin0, clientId, new Date()).catch(() => []))
          .map((c) => ({ ...c, id: c.card_key, fired_at: new Date().toISOString(), is_state: true, ...presentCardType(c.card_type) }))
        return NextResponse.json({ cards: [...fresh, ...states] }, { headers: { 'Cache-Control': 'no-store' } })
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

const MARKS: Record<string, string> = {
  read: 'read_at',
  open: 'opened_at',
  share: 'shared_at',
  dismiss: 'dismissed_at',
}

/** Cross-device card state: seen, opened, shared, or dismissed. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { clientId?: string; id?: string; action?: string } | null
  const clientId = body?.clientId ?? ''
  const cardKey = body?.id ?? ''
  const action = body?.action
  if (!clientId || !cardKey || !action || !MARKS[action]) {
    return NextResponse.json({ error: 'clientId, id, action required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = isStaffRole(profile?.role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const patch = { [MARKS[action]]: new Date().toISOString() }
  const { error } = await adminDb()
    .from('proof_cards')
    .update(patch)
    .eq('client_id', clientId)
    .eq('card_key', cardKey)
  // No table yet (42P01, before migration 249) is fine for any mark: the client-side
  // localStorage fallback covers dismissal, and a mark is never worth a 500.
  // A missing COLUMN (42703) is only expected for opened_at / shared_at, which arrive with 257.
  // read_at and dismissed_at have been there since 249, so a 42703 on those is a real fault and
  // must be seen, not quietly dropped.
  const newMark = action === 'open' || action === 'share'
  const expected = error?.code === '42P01' || (newMark && error?.code === '42703')
  if (error && !expected) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
