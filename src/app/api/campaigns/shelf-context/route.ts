/**
 * /api/campaigns/shelf-context — the four facts the Create shelf needs about THIS client, and
 * nothing else.
 *
 *   goals   the chips they picked in setup, in priority order and in their own words, so the
 *           goal rail opens on what they said instead of a generic "For you"
 *   budget  businesses.monthly_budget, the first-payment cap. Null means they never answered,
 *           and the store shows a "Set a budget" chip rather than guessing one
 *   shape    clients.shape, which decides what the store may show a truck or a delivery kitchen
 *   hasGoogle whether Google has ever reported a day for them. A card's reason line is either
 *           their own number or the honest "we don't have your Google numbers yet"; it is never
 *           a zero dressed up as a measurement
 *
 * Every read is best-effort and independent: a client with no goals, no budget and no Google
 * still gets a working shelf. Nothing here is new math.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientShelfShape, DEFAULT_SHAPE } from '@/lib/clients/shape'
import { hasGoogle } from '@/lib/promises/metrics'
import { chipForGoalSlug } from '@/lib/goals/defaults'

export const maxDuration = 15

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  const [goalRows, bizRow, shape, google] = await Promise.allSettled([
    admin.from('client_goals').select('goal_slug, priority').eq('client_id', clientId).eq('status', 'active').order('priority'),
    admin.from('businesses').select('monthly_budget').eq('client_id', clientId).limit(1),
    getClientShelfShape(clientId),
    hasGoogle(clientId),
  ])

  const goals: string[] = []
  if (goalRows.status === 'fulfilled') {
    for (const r of (goalRows.value.data ?? []) as { goal_slug: string }[]) {
      const chip = chipForGoalSlug(r.goal_slug)
      if (chip && !goals.includes(chip)) goals.push(chip)
    }
  }

  // A cap of 0 is not a cap, it is an empty field saved as a number. Treated as unanswered.
  const bizRows = bizRow.status === 'fulfilled' ? ((bizRow.value.data ?? []) as { monthly_budget?: number | null }[]) : []
  const raw = bizRows[0]?.monthly_budget ?? null
  const monthlyBudget = typeof raw === 'number' && raw > 0 ? raw : null

  return NextResponse.json({
    goals,
    monthlyBudget,
    shape: shape.status === 'fulfilled' ? shape.value : DEFAULT_SHAPE,
    hasGoogle: google.status === 'fulfilled' ? google.value : false,
  })
}

/**
 * Set the budget from the store, so "Set a budget" and "Raise budget" are one tap and not a trip
 * to a settings page. Writes businesses.monthly_budget, the same column onboarding writes.
 * A null clears the cap (the shelf then shows everything and asks again).
 */
export async function PATCH(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const body = (await req.json().catch(() => ({}))) as { monthlyBudget?: unknown }
  const raw = body.monthlyBudget
  // Fail closed on anything that is not a real number or an explicit clear.
  if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1_000_000)) {
    return NextResponse.json({ error: 'monthlyBudget must be a number or null' }, { status: 400 })
  }

  // .select('id') so we learn how many rows the update actually touched. Without it a client
  // with no businesses row got {ok:true} and a shelf that redrew at the new cap, then reverted
  // on the next load with nothing to explain it. A write that matched nothing is a 404.
  const { data, error } = await createAdminClient()
    .from('businesses')
    .update({ monthly_budget: raw })
    .eq('client_id', clientId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    console.warn(`[shelf-context] budget not saved: no businesses row for client ${clientId}`)
    return NextResponse.json({ error: 'no business to save the budget on' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, monthlyBudget: raw })
}
