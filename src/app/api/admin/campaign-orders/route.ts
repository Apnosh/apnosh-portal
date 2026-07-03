import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCampaignOrderConfirmed } from '@/lib/notify'
import { getCampaignProgressBatch } from '@/lib/campaigns/server'

/** A shipped campaign's lifecycle status for the admin list. */
type OrderStatus = 'awaiting' | 'production' | 'live' | 'done'

/** Sum a campaign's included line items into a monthly + one-time price (dollars) and a piece count.
 *  Recurring weekly is normalized to monthly (x4); per-occurrence is volume-dependent, so it is left
 *  out of the fixed figure (mirrors planCostForGoal). Cadence is the stored tagged-union jsonb. */
function priceOf(items: { price: unknown; cadence: unknown; included: unknown }[]): { monthly: number; oneTime: number; count: number } {
  let monthly = 0, oneTime = 0, count = 0
  for (const it of items) {
    if (it.included === false) continue
    count++
    const price = typeof it.price === 'number' ? it.price : 0
    const cad = (it.cadence ?? {}) as { kind?: string; every?: string }
    if (cad.kind === 'recurring') monthly += cad.every === 'weekly' ? price * 4 : price
    else if (cad.kind === 'one-time') oneTime += price
  }
  return { monthly, oneTime, count }
}

/**
 * Admin campaign-order confirmation queue.
 * GET  -> shipped campaigns with client names, unconfirmed first (the review queue).
 * POST -> { id } confirms one: sets confirmed_at once (idempotent), then notifies the owner.
 * Admin-only: the caller's profile role is checked before the service-role client touches anything.
 */
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const svc = createAdminClient()
  // Unconfirmed first (confirmed_at NULLS FIRST), then newest ship: confirmed history can
  // never push a still-waiting order out of the 100-row window.
  let confirmationsReady = true
  // Stopped campaigns stay in the list: they can carry accrued charges that still
  // need invoicing — dropping them would hide money from the humans who bill it.
  let { data, error } = await svc
    .from('campaigns')
    .select('id, name, client_id, shipped_at, confirmed_at')
    .in('status', ['shipped', 'stopped'])
    .order('confirmed_at', { ascending: false, nullsFirst: true })
    .order('shipped_at', { ascending: false })
    .limit(100)
  if (error && error.code === '42703') {
    // Pre-migration 189 confirmed_at is absent; re-read without it so the queue still
    // loads. Every row reads unconfirmed and the page disables its confirm button.
    confirmationsReady = false
    const fallback = await svc
      .from('campaigns')
      .select('id, name, client_id, shipped_at')
      .in('status', ['shipped', 'stopped'])
      .order('shipped_at', { ascending: false })
      .limit(100)
    data = (fallback.data ?? []).map((r) => ({ ...r, confirmed_at: null }))
    error = fallback.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const ids = rows.map((r) => r.id as string)
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))]

  // Batch every enrichment so 100 orders cost 3 queries, not 300.
  const [names, priceByCampaign, progress] = await Promise.all([
    (async () => {
      const m = new Map<string, string>()
      if (clientIds.length) {
        const { data: clients } = await svc.from('clients').select('id, name').in('id', clientIds)
        for (const c of clients ?? []) m.set(c.id as string, (c.name as string) ?? '')
      }
      return m
    })(),
    (async () => {
      const m = new Map<string, { monthly: number; oneTime: number; count: number }>()
      if (ids.length) {
        const { data: li } = await svc.from('campaign_line_items').select('campaign_id, price, cadence, included').in('campaign_id', ids)
        const byCampaign = new Map<string, { price: unknown; cadence: unknown; included: unknown }[]>()
        for (const row of li ?? []) { const k = row.campaign_id as string; (byCampaign.get(k) ?? byCampaign.set(k, []).get(k)!).push(row) }
        for (const [k, items] of byCampaign) m.set(k, priceOf(items))
      }
      return m
    })(),
    getCampaignProgressBatch(ids).catch(() => ({} as Awaited<ReturnType<typeof getCampaignProgressBatch>>)),
  ])

  const orders = rows.map((r) => {
    const id = r.id as string
    const confirmedAt = (r.confirmed_at as string | null) ?? null
    const prog = progress[id] ?? null
    const total = prog?.total ?? 0
    const live = prog?.live ?? 0
    // Lifecycle: unconfirmed = awaiting a human; once confirmed, read the real production state.
    let status: OrderStatus = 'awaiting'
    if (confirmedAt) {
      if (total > 0 && live >= total) status = 'done'
      else if (live > 0) status = 'live'
      else status = 'production'
    }
    const price = priceByCampaign.get(id) ?? { monthly: 0, oneTime: 0, count: 0 }
    return {
      id,
      shortId: id.slice(0, 8),
      name: r.name,
      clientName: names.get(r.client_id as string) ?? 'Unknown client',
      shippedAt: r.shipped_at,
      confirmedAt,
      status,
      monthly: price.monthly,
      oneTime: price.oneTime,
      pieceCount: price.count,
      live,
      total,
    }
  })

  return NextResponse.json({ confirmationsReady, orders })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const svc = createAdminClient()
  const confirmedAt = new Date().toISOString()
  // Idempotent: only the first confirm writes; a second tap changes nothing.
  const { data: updated, error } = await svc
    .from('campaigns')
    .update({ confirmed_at: confirmedAt })
    .eq('id', id)
    .eq('status', 'shipped')
    .is('confirmed_at', null)
    .select('id, name, client_id, confirmed_at')
    .maybeSingle()
  if (error) {
    // Pre-migration 189 confirmed_at is absent; say so plainly instead of a raw 500.
    // PostgREST rejects the unknown update column from its schema cache as PGRST204
    // (verified against the live DB) before SQL ever runs; 42703 covers the SQL-level
    // form, e.g. if the cache is fresh but the column was dropped.
    if (error.code === 'PGRST204' || error.code === '42703') {
      return NextResponse.json({ error: 'Confirmations are not on yet. Try again after the next update.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updated) {
    // Nothing matched: a bad id is a 404; a campaign confirmed earlier stays an idempotent 200.
    // A failed read must stay a 500 — a transient error is not proof the campaign is gone.
    const { data: cur, error: curErr } = await svc.from('campaigns').select('id, confirmed_at').eq('id', id).maybeSingle()
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
    if (!cur) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
    return NextResponse.json({ id, confirmedAt: cur.confirmed_at ?? null, alreadyConfirmed: true })
  }

  // Tell the owner their order is confirmed (best-effort): client -> business -> owner user.
  ;(async () => {
    const { data: biz } = await svc.from('businesses').select('owner_id').eq('client_id', updated.client_id).maybeSingle()
    if (biz?.owner_id) await notifyCampaignOrderConfirmed(svc, biz.owner_id as string, updated.name as string, id)
  })().catch(() => {})

  return NextResponse.json({ id, confirmedAt: updated.confirmed_at })
}
