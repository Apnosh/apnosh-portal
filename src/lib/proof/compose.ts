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
import { getCachedThemes } from '@/lib/review-themes'
import { moveForTheme, titleCase } from '@/lib/reviews/moves'

export interface ProofCardRow {
  card_key: string
  card_type: 'gbp_week' | 'post' | 'reviews' | 'gbp_down' | 'steady' | 'coming_up' | 'reviews_waiting' | 'start_campaign' | 'connect_google' | 'google_paused' | 'approval_waiting' | 'complaint_watch'
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
  curDays: number
  priorDays: number
  latestDate: string | null
}

async function readGbpWindows(admin: SupabaseClient, clientId: string, now: Date): Promise<GbpWindows> {
  /* Google's performance data lands 2-3 days late. Anchoring the window to
   * "yesterday" would leave the newest days empty and read every week as a
   * dip. So the window ends the day AFTER the latest day Google has given us
   * (never later than today). */
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0)
  const { data: latest } = await admin
    .from('gbp_metrics')
    .select('date')
    .eq('client_id', clientId)
    .neq('location_id', 'demo-proof')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  let end = today
  if (latest?.date) {
    const d = new Date(`${String(latest.date)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
    if (d.getTime() < today.getTime()) end = d
  }
  const curStart = new Date(end); curStart.setUTCDate(curStart.getUTCDate() - 7)
  const priorStart = new Date(end); priorStart.setUTCDate(priorStart.getUTCDate() - 14)
  const { data: rows } = await admin
    .from('gbp_metrics')
    .select('date, directions, calls, location_id')
    .eq('client_id', clientId)
    .gte('date', iso(priorStart))
    .lt('date', iso(end))
  const w: GbpWindows = { cur: { directions: 0, calls: 0 }, prior: { directions: 0, calls: 0 }, daily: new Map(), hasDemo: false, curStart, curDays: 0, priorDays: 0, latestDate: latest?.date ? String(latest.date) : null }
  const curDays = new Set<string>(), priorDays = new Set<string>()
  for (const r of rows ?? []) {
    if (r.location_id === 'demo-proof') w.hasDemo = true
    const d = String(r.date)
    const dirs = Number(r.directions) || 0
    const calls = Number(r.calls) || 0
    if (d >= iso(curStart)) {
      w.cur.directions += dirs; w.cur.calls += calls
      w.daily.set(d, (w.daily.get(d) ?? 0) + dirs + calls)
      curDays.add(d)
    } else {
      w.prior.directions += dirs; w.prior.calls += calls
      priorDays.add(d)
    }
  }
  w.curDays = curDays.size; w.priorDays = priorDays.size
  return w
}

/** Both windows need real coverage (5 of 7 days each) before any Google
 *  card may speak. A half-synced week is silence, not a signal. */
function gbpCovered(w: GbpWindows): boolean {
  return w.curDays >= 5 && w.priorDays >= 5
}

/** True when a card of this type fired for the client within N days. */
async function firedWithin(admin: SupabaseClient, clientId: string, type: string, days: number, now: Date): Promise<boolean> {
  const since = new Date(now); since.setUTCDate(since.getUTCDate() - days)
  const { count } = await admin
    .from('proof_cards')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('card_type', type)
    .gte('fired_at', since.toISOString())
  return (count ?? 0) > 0
}

/** R-01 — "This week on Google": last 7 full days vs the 7 before. */
export async function evalGbpWeek(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow | null> {
  const w = await readGbpWindows(admin, clientId, now)
  const curTotal = w.cur.directions + w.cur.calls
  const priorTotal = w.prior.directions + w.prior.calls
  // A win is a REAL rise: 10%+ over the prior week with at least 5 actions
  // (a first tracked week counts once it reaches 5). Not "+1".
  if (!w.hasDemo && !gbpCovered(w)) return null
  if (curTotal < 10) return null
  if (priorTotal > 0 && (curTotal < priorTotal * 1.10 || curTotal - priorTotal < 3)) return null
  // The composer runs nightly on a rolling window: one Google win per 7 days.
  if (await firedWithin(admin, clientId, 'gbp_week', 7, now)) return null

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
  if (w.hasDemo || !gbpCovered(w)) return null
  const curTotal = w.cur.directions + w.cur.calls
  const priorTotal = w.prior.directions + w.prior.calls
  if (priorTotal < 20) return null
  if (curTotal >= priorTotal * 0.75) return null

  if (await firedWithin(admin, clientId, 'gbp_down', 14, now)) return null
  // Never a down card in the week after a win card either.
  if (await firedWithin(admin, clientId, 'gbp_week', 7, now)) return null

  const parts: string[] = []
  if (w.cur.calls > 0) parts.push(plural(w.cur.calls, 'call'))
  parts.push(`${w.cur.directions} direction tap${w.cur.directions === 1 ? '' : 's'}`)
  return {
    card_key: `gbp-down-${iso(w.curStart)}`,
    card_type: 'gbp_down',
    label: 'Quieter week on Google',
    big: parts.join(' · '),
    context: w.prior.calls > 0
      ? `Down from ${plural(w.prior.calls, 'call')} and ${plural(w.prior.directions, 'tap')} the week before. A push this week turns it around.`
      : `Down from ${plural(w.prior.directions, 'tap')} the week before. A push this week turns it around.`,
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

  // Candidates: every post 72h+ old within 30 days that has not been carded
  // yet (two posts can cross 72h the same night). The best one fires.
  const { data: carded } = await admin
    .from('proof_cards').select('card_key').eq('client_id', clientId).eq('card_type', 'post').limit(200)
  const done = new Set((carded ?? []).map((c) => String(c.card_key)))
  let cand: P | null = null
  for (const p of parsed) {
    if (p.published_at > cutoff.toISOString() || p.published_at < windowStart.toISOString()) continue
    if (done.has(`post-${p.id}`)) continue
    const priors = parsed.filter((q) => q.published_at < p.published_at).map((q) => q.reach)
    if (priors.length < 3) continue
    const sorted = [...priors].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    if (p.reach <= median) continue
    if (!cand || p.reach > cand.reach) cand = p
  }
  if (!cand) return null

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

  /* Reviews carry only their INGEST time. A fresh connection backfills years
   * of reviews in one night, which would read as a huge review month. So the
   * card needs the client's review history to be older than the window. */
  const { data: first } = await admin
    .from('reviews').select('created_at').eq('client_id', clientId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!first?.created_at || new Date(String(first.created_at)).getTime() > prev2Start.getTime()) return null
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


/* ─────────────────────────────────────────────────────────────────────────
 * STATE CARDS — computed on every read, never stored, never notified.
 * They describe where the business IS right now, so the deck always has
 * something true to say no matter how the numbers are moving:
 *   steady          a Google week within ±25% of the last one (no event fired)
 *   coming_up       work in production for this client
 *   reviews_waiting reviews without a reply
 *   start_campaign  nothing has ever shipped
 *   connect_google  no Google data at all
 * Order below is the deck's priority after event cards.
 * ───────────────────────────────────────────────────────────────────────── */
export async function computeStateCards(admin: SupabaseClient, clientId: string, now: Date): Promise<ProofCardRow[]> {
  const out: ProofCardRow[] = []
  const sixtyAgo = new Date(now); sixtyAgo.setUTCDate(sixtyAgo.getUTCDate() - 60)

  const ninetyAgo = new Date(now); ninetyAgo.setUTCDate(ninetyAgo.getUTCDate() - 90)
  const [w, reviewsRes, woRes, campRes, recentEvents, anyGbpRows, firstReview] = await Promise.all([
    readGbpWindows(admin, clientId, now),
    admin.from('reviews').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).is('responded_at', null).gte('created_at', sixtyAgo.toISOString()),
    admin.from('service_work_orders').select('id, title, status')
      .eq('client_id', clientId).in('status', ['queued', 'claimed', 'in_progress', 'ready_for_client']).limit(10),
    admin.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    admin.from('proof_cards').select('card_type, fired_at')
      .eq('client_id', clientId).in('card_type', ['gbp_week', 'gbp_down'])
      .gte('fired_at', new Date(now.getTime() - 7 * 86400e3).toISOString()).limit(1),
    admin.from('gbp_metrics').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).neq('location_id', 'demo-proof').gte('date', iso(ninetyAgo)),
    admin.from('reviews').select('created_at').eq('client_id', clientId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ])

  const curTotal = w.cur.directions + w.cur.calls
  const priorTotal = w.prior.directions + w.prior.calls
  const hasGoogleData = curTotal + priorTotal > 0
  const eventThisWeek = (recentEvents.data ?? []).length > 0

  // reviews waiting (action) — not during the first 45 days after connecting,
  // when a backfill of old reviews would read as a pile of new ones.
  const waiting = reviewsRes.count ?? 0
  const fortyFiveAgo = new Date(now); fortyFiveAgo.setUTCDate(fortyFiveAgo.getUTCDate() - 45)
  const reviewsMature = !!firstReview.data?.created_at && new Date(String(firstReview.data.created_at)).getTime() < fortyFiveAgo.getTime()
  if (waiting > 0 && reviewsMature) {
    out.push({
      card_key: `state-reviews-waiting`, card_type: 'reviews_waiting',
      label: 'Reviews',
      big: `${waiting} review${waiting === 1 ? '' : 's'} waiting for a reply`,
      context: 'A quick reply keeps your rating climbing and shows Google you are listening.',
    })
  }

  // heard more than once (transparency): a complaint theme with 2+ mentions,
  // always carrying the move. Only once review history is mature.
  if (reviewsMature) {
    const themes = await getCachedThemes(clientId, null, 30).catch(() => null)
    const worst = (themes?.themes ?? []).filter((t) => t.critical >= 2).sort((a, b) => b.critical - a.critical)[0]
    if (worst) {
      const mv = moveForTheme(worst.theme)
      out.push({
        card_key: `state-complaint-${worst.theme.replace(/\W+/g, '-').toLowerCase()}`, card_type: 'complaint_watch',
        label: 'Heard more than once',
        big: titleCase(worst.theme),
        context: `${worst.critical} recent reviews mention it. The move: ${mv.move}`,
      })
    }
  }

  // waiting on the owner (action): work finished and ready for their approval
  const all = woRes.data ?? []
  const ready = all.filter((o) => o.status === 'ready_for_client')
  if (ready.length > 0) {
    out.push({
      card_key: `state-approval-waiting`, card_type: 'approval_waiting',
      label: 'Ready for you',
      big: ready.length === 1 ? String(ready[0].title) : `${ready.length} pieces ready for your approval`,
      context: ready.length === 1 ? 'Take a look and approve it, and it goes live.' : 'Take a look and approve them, and they go live.',
    })
  }

  // coming up (anticipation): work still in production
  const inFlight = all.filter((o) => o.status !== 'ready_for_client')
  if (inFlight.length > 0) {
    out.push({
      card_key: `state-coming-up`, card_type: 'coming_up',
      label: 'Coming up',
      big: inFlight.length === 1 ? String(inFlight[0].title) : `${inFlight.length} pieces in production`,
      context: inFlight.length === 1 ? 'Your team is on it. It lands here when it is ready.' : 'Your team is on them. Each one lands here when it is ready.',
    })
  }

  // steady week (only when no win/down card spoke this week)
  if (hasGoogleData && curTotal > 0 && !eventThisWeek && !w.hasDemo && gbpCovered(w)) {
    const ratio = priorTotal > 0 ? curTotal / priorTotal : 1
    if (ratio >= 0.75 && ratio < 1.10) {
      const parts: string[] = []
      if (w.cur.calls > 0) parts.push(plural(w.cur.calls, 'call'))
      parts.push(`${w.cur.directions} direction tap${w.cur.directions === 1 ? '' : 's'}`)
      out.push({
        card_key: `state-steady-${iso(w.curStart)}`, card_type: 'steady',
        label: 'This week on Google',
        big: parts.join(' · '),
        context: 'About the same as last week. Steady is good; a push turns steady into growth.',
      })
    }
  }

  // nothing shipped yet (growth nudge) — no campaign AND no work orders ever
  if ((campRes.count ?? 0) === 0 && all.length === 0) {
    out.push({
      card_key: `state-start-campaign`, card_type: 'start_campaign',
      label: 'Grow',
      big: 'Start your first campaign',
      context: 'A plan built from your numbers, ready in a few minutes.',
    })
  }

  // Google went quiet: rows exist but the newest is more than 5 days old —
  // the sync is broken (token, permissions), not the business.
  if ((anyGbpRows.count ?? 0) > 0 && w.latestDate) {
    const ageDays = Math.floor((now.getTime() - new Date(`${w.latestDate}T00:00:00Z`).getTime()) / 86400e3)
    if (ageDays > 5) {
      out.push({
        card_key: `state-google-paused`, card_type: 'google_paused',
        label: 'Google',
        big: `No new Google data for ${ageDays} days`,
        context: 'The connection needs a quick reconnect. Your numbers pick up where they left off.',
      })
    }
  }

  // no Google data at all (setup): rows would exist if the listing were linked,
  // even for a quiet listing — so this means genuinely not connected.
  if ((anyGbpRows.count ?? 0) === 0) {
    out.push({
      card_key: `state-connect-google`, card_type: 'connect_google',
      label: 'Get set up',
      big: 'Connect Google to see your numbers',
      context: 'Calls, directions and reviews show up here once your listing is linked.',
    })
  }

  return out
}
