/**
 * POST /api/campaigns/profile-recall — remember durable profile facts from a
 * just-confirmed campaign's madlib answers.
 *
 * The cold-start problem: a new client answers the basics (what they're after,
 * who they're for) INSIDE their first campaign, the answers live only in that
 * campaign's draft, and the profile stays empty — so every later campaign asks
 * again and the planning brain (suggestTier reads primary_goal; the madlib
 * prefills read target_audience) never hears what the owner already said.
 *
 * FILL-WHEN-EMPTY only, by design: a campaign answer seeds a blank profile
 * field but never overwrites one the owner set deliberately — campaigns are
 * moments, the profile is standing truth. The write is a compare-and-swap on
 * the value we read, so a confirm racing the owner's own profile save loses
 * instead of clobbering it. Untouched slot DEFAULTS are never persisted — an
 * owner who breezed past "people nearby" did not tell us their audience.
 * Event goals (launch/promote) are never a standing primary goal. Best-effort:
 * the campaign is already confirmed when this runs; a failure costs only the
 * memory.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Only the standing system goals read as a business's primary goal. The values are
// the EXACT onboarding GOAL_CHIPS phrases, so a seeded goal renders as a selected
// chip if the owner later resumes onboarding — one vocabulary, not a third one.
// Keys cover both the catalog id (reviewsplan) and its brain alias (reviews):
// builder-entry stores the ALIASED id in plan.itemId.
const GOAL_TO_PRIMARY: Record<string, string> = {
  firstvisit: 'More foot traffic overall',
  nights: 'More customers on slow days',
  regulars: 'Stay top of mind',
  reviews: 'Improve online reputation',
  reviewsplan: 'Improve online reputation',
}

// Slot defaults that must never become standing profile truth: leaving the picker
// untouched is not an answer. (A deliberate pick of the same words is also skipped —
// acceptable: it IS the generic suggestion.)
const DEFAULT_ANSWERS = new Set(['people nearby', 'offices nearby'])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = typeof body?.clientId === 'string' ? body.clientId : null
  const goalId = typeof body?.goalId === 'string' ? body.goalId : ''
  const vals = (body?.vals ?? {}) as Record<string, unknown>
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const primaryGoal = GOAL_TO_PRIMARY[goalId] ?? null
  let audience =
    typeof vals.who === 'string' && vals.who.trim() ? vals.who.trim()
    : Array.isArray(vals.audience) ? vals.audience.filter((a) => typeof a === 'string' && a.trim()).join(', ') || null
    : typeof vals.audience === 'string' && vals.audience.trim() ? vals.audience.trim()
    : null
  if (audience && DEFAULT_ANSWERS.has(audience.toLowerCase())) audience = null
  if (!primaryGoal && !audience) return NextResponse.json({ remembered: [] })

  const admin = createAdminClient()
  const { data: biz, error } = await admin
    .from('businesses')
    .select('id, primary_goal, target_audience')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !biz) return NextResponse.json({ remembered: [] })

  const empty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

  // Per-field compare-and-swap: the update only lands if the column still holds
  // exactly what we read (null or the same blank string) — never a value the
  // owner saved in the race window.
  const fillIfStillEmpty = async (col: 'primary_goal' | 'target_audience', value: string): Promise<boolean> => {
    let q = admin.from('businesses').update({ [col]: value }).eq('id', biz.id)
    const current = biz[col] as string | null
    q = current == null ? q.is(col, null) : q.eq(col, current)
    const { data } = await q.select('id').maybeSingle()
    return !!data
  }

  const remembered: string[] = []
  if (primaryGoal && empty(biz.primary_goal) && (await fillIfStillEmpty('primary_goal', primaryGoal))) remembered.push('primary_goal')
  if (audience && empty(biz.target_audience) && (await fillIfStillEmpty('target_audience', audience))) remembered.push('target_audience')
  return NextResponse.json({ remembered })
}
