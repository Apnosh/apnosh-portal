/**
 * The proof composer: evaluates each client's real ledgers and fires cards.
 *
 * Laws (see the "Proof It's Working" spec):
 *  L3 — every number is real; below threshold means NO card, never filler.
 *  L4 — "since" phrasing for time-window attribution; a post's own reach is
 *       the one causal claim allowed.
 *  Cap — at most 2 cards fired per client per rolling 7 days.
 *
 * Evaluators are idempotent by card_key (unique per client): re-running a
 * night never duplicates a card.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProofCardRow {
  card_key: string
  card_type: 'gbp_week' | 'post' | 'reviews' | 'gbp_down'
  label: string
  big: string
  context: string
  attribution?: string
  spark?: number[]
  is_sample?: boolean
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

interface GbpWindows {
  cur: { directions: number; calls: number }
  prior: { directions: number; calls: number }
  daily: Map<string, number>
  hasDemo: boolean
  curStart: Date
}

async function readGbpWindows(admin: SupabaseClient, clientId: string, now: Date): Promise<GbpWindows> {
  const end = new Date(now); end.setUTCHours(0, 0, 0, 0)
  const curStart = new Date(end); curStart.setUTCDate(curStart.getUTCDate() - 7)
  const priorStart = new Date(end); priorStart.setUTCDate(priorStart.getUTCDate() - 14)
  const { data: rows } = await admin
    .from('gbp_metrics')
    .select('date, directions, calls, location_id')
    .eq('client_id', clientId)
    .gte('date', iso(priorStart))
    .lt('date', iso(end))
  const w: GbpWindows = { cur: { directions: 0, calls: 0 }, prior: { directions: 0, calls: 0 }, daily: new Map(), hasDemo: false, curStart }
  for (const r of rows ?? []) {
    if (r.location_id === 'demo-proof') w.hasDemo = true
    const d = String(r.date)
    const dirs = Number(r.directions) || 0
    const calls = Number(r.calls) || 0
    if (d >= iso(curStart)) {
      w.cur.directions += dirs; w.cur.calls += calls
      w.daily.set(d, (w.daily.get(d) ?? 0) + dirs + calls)
    } else {
      w.prior.directions += dirs; w.prior.calls += calls
    }
  }
  return w
}

/** R-01 — "This week on Google": last 7 full days vs the 7 before. */
export async function evalGbpWeek(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow | null> {
  const w = await readGbpWindows(admin, clientId, now)
  const curTotal = w.cur.directions + w.cur.calls
  const priorTotal = w.prior.directions + w.prior.calls
  if (curTotal === 0 || curTotal <= priorTotal) return null

  const spark: number[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(w.curStart); d.setUTCDate(d.getUTCDate() + i)
    spark.push(w.daily.get(iso(d)) ?? 0)
  }

  let attribution: string | undefined
  const since = new Date(now); since.setUTCDate(since.getUTCDate() - 30)
  const { data: wo } = await admin
    .from('service_work_orders')
    .select('title, delivered_at')
    .eq('client_id', clientId)
    .eq('status', 'delivered')
    .gte('delivered_at', since.toISOString())
    .order('delivered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (wo?.delivered_at) {
    const label = new Date(wo.delivered_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    attribution = `Since ${wo.title} went live, ${label}.`
  }

  const parts: string[] = []
  if (w.cur.calls > 0) parts.push(plural(w.cur.calls, 'call'))
  parts.push(`${w.cur.directions} direction tap${w.cur.directions === 1 ? '' : 's'}`)

  return {
    card_key: `gbp-${iso(w.curStart)}`,
    card_type: 'gbp_week',
    label: w.hasDemo ? 'Sample · a week on Google' : 'This week on Google',
    big: parts.join(' · '),
    context: priorTotal > 0
      ? `Up from ${plural(w.prior.calls, 'call')} and ${plural(w.prior.directions, 'tap')} the week before.`
      : 'Your first tracked week.',
    attribution: w.hasDemo
      ? 'Demo numbers so you can see the card. Real weeks replace this.'
      : attribution,
    spark,
    is_sample: w.hasDemo,
  }
}

/** R-06 — the quieter week, transparency with a move attached.
 *  Fires only on a meaningful drop (25%+ with real volume), never from demo
 *  data, at most one per 14 days, and never in a week that earned a win. */
export async function evalGbpDownWeek(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow | null> {
  const w = await readGbpWindows(admin, clientId, now)
  if (w.hasDemo) return null
  const curTotal = w.cur.directions + w.cur.calls
  const priorTotal = w.prior.directions + w.prior.calls
  if (priorTotal < 20) return null
  if (curTotal >= priorTotal * 0.75) return null

  const twoWeeksAgo = new Date(now); twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14)
  const { count } = await admin
    .from('proof_cards')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('card_type', 'gbp_down')
    .gte('fired_at', twoWeeksAgo.toISOString())
  if ((count ?? 0) > 0) return null

  return {
    card_key: `gbp-down-${iso(w.curStart)}`,
    card_type: 'gbp_down',
    label: 'Quieter week on Google',
    big: `${plural(w.cur.calls, 'call')} · ${w.cur.directions} direction tap${w.cur.directions === 1 ? '' : 's'}`,
    context: `Down from ${plural(w.prior.calls, 'call')} and ${plural(w.prior.directions, 'tap')} the week before. A push this week turns it around.`,
  }
}

/** R-02 — a published post that beat the account's usual reach.
 *  Source: content_drafts.outcome_summary ({ reach, interactions, ... }),
 *  72h+ after publish, needing 3+ prior published posts for an honest median. */
export async function evalPost(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow | null> {
  const cutoff = new Date(now); cutoff.setUTCHours(cutoff.getUTCHours() - 72)
  const windowStart = new Date(now); windowStart.setUTCDate(windowStart.getUTCDate() - 30)

  const { data: posts } = await admin
    .from('content_drafts')
    .select('id, title, published_at, outcome_summary')
    .eq('client_id', clientId)
    .not('published_at', 'is', null)
    .not('outcome_summary', 'is', null)
    .order('published_at', { ascending: false })
    .limit(24)
  if (!posts || posts.length < 4) return null

  type P = { id: string; title: string | null; published_at: string; reach: number; interactions: number }
  const parsed: P[] = posts
    .map((p) => {
      const o = (p.outcome_summary ?? {}) as Record<string, unknown>
      return {
        id: String(p.id), title: (p.title as string | null) ?? null,
        published_at: String(p.published_at),
        reach: Number(o.reach) || 0,
        interactions: Number(o.interactions) || 0,
      }
    })
    .filter((p) => p.reach > 0)
  if (parsed.length < 4) return null

  // Candidate: newest post published 72h+ ago, within the last 30 days.
  const cand = parsed.find((p) => p.published_at <= cutoff.toISOString() && p.published_at >= windowStart.toISOString())
  if (!cand) return null
  const priors = parsed.filter((p) => p.published_at < cand.published_at).map((p) => p.reach)
  if (priors.length < 3) return null
  const sorted = [...priors].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (cand.reach <= median) return null

  const day = new Date(cand.published_at).toLocaleDateString('en-US', { weekday: 'long' })
  return {
    card_key: `post-${cand.id}`,
    card_type: 'post',
    label: cand.title ? `Your ${cand.title.slice(0, 28).toLowerCase()}` : 'Your latest post',
    big: `${cand.reach.toLocaleString('en-US')} people saw it`,
    context: cand.interactions > 0
      ? `${cand.interactions.toLocaleString('en-US')} liked, saved or shared it.`
      : `More reach than your usual post.`,
    attribution: `You approved it. It published ${day}.`,
  }
}

/** R-03 — a rising review month, fired in the first 3 days of the next month,
 *  only when the numbers rose AND review-touching delivered work exists. */
export async function evalReviews(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow | null> {
  if (now.getUTCDate() > 3) return null
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const prev2Start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))

  const { data: rows } = await admin
    .from('reviews')
    .select('rating, created_at')
    .eq('client_id', clientId)
    .gte('created_at', prev2Start.toISOString())
    .lt('created_at', monthStart.toISOString())
  if (!rows?.length) return null

  const prevMonth = rows.filter((r) => String(r.created_at) >= prevStart.toISOString())
  const monthBefore = rows.filter((r) => String(r.created_at) < prevStart.toISOString())
  if (!prevMonth.length) return null
  const avg = prevMonth.reduce((a, r) => a + Number(r.rating), 0) / prevMonth.length
  const beforeAvg = monthBefore.length ? monthBefore.reduce((a, r) => a + Number(r.rating), 0) / monthBefore.length : 0
  const rose = prevMonth.length > monthBefore.length || (monthBefore.length > 0 && avg > beforeAvg)
  if (!rose) return null

  const { data: wo } = await admin
    .from('service_work_orders')
    .select('title, delivered_at')
    .eq('client_id', clientId)
    .eq('status', 'delivered')
    .gte('delivered_at', prev2Start.toISOString())
    .or('title.ilike.%review%,service_id.ilike.%review%')
    .order('delivered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!wo?.delivered_at) return null

  const monthLabel = prevStart.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const dLabel = new Date(wo.delivered_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    card_key: `reviews-${prevStart.toISOString().slice(0, 7)}`,
    card_type: 'reviews',
    label: `${monthLabel} reviews`,
    big: `${plural(prevMonth.length, 'new review')} · ${avg.toFixed(1)} average`,
    context: monthBefore.length
      ? `Up from ${plural(monthBefore.length, 'review')} the month before.`
      : 'Your best review month on record here.',
    attribution: `Since ${wo.title} went live, ${dLabel}.`,
  }
}

/** Run all evaluators for one client; insert what is new; respect the 2/7d cap.
 *  Returns the card_keys actually fired (new rows). */
export async function composeForClient(admin: SupabaseClient, clientId: string, now: Date): Promise<string[]> {
  const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
  const { count } = await admin
    .from('proof_cards')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('fired_at', weekAgo.toISOString())
  let budget = Math.max(0, 2 - (count ?? 0))
  if (budget === 0) return []

  const [win, post, reviews] = await Promise.all([
    evalGbpWeek(admin, clientId, now),
    evalPost(admin, clientId, now),
    evalReviews(admin, clientId, now),
  ])
  // The down-week card only speaks when the win card has nothing to say.
  const down = win ? null : await evalGbpDownWeek(admin, clientId, now)
  const candidates = [win, post, reviews, down].filter((c): c is ProofCardRow => !!c)

  const fired: string[] = []
  for (const c of candidates) {
    if (budget === 0) break
    const { error } = await admin.from('proof_cards').insert({ client_id: clientId, ...c })
    if (!error) { fired.push(c.card_key); budget-- }
    // 23505 = already fired earlier; 23514 = card_type check pre-migration-250
  }
  return fired
}
