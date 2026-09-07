import 'server-only'
/**
 * promises/read — the "Counted, as promised" rows for one client, in the words Home prints.
 *
 * Read ALWAYS: a flat month shows "41, was 41", a drop shows the drop. This file decides WHICH of
 * the seven states a row is in; ./lines says what each one is called. In the order an order lives
 * them:
 *   stopped      the campaign was stopped              → what happened to the money, or nothing new
 *   ordered      paid, no work order has a name on it  → "your team starts it next"
 *   production   a name on it, and it has started      → "your team is on it"
 *   held         a start date in the future            → "Starts Jan 20"
 *   delivered    the work landed, the count has not    → "your count starts Sep 12"
 *   counting     before shows_on, or no reported days  → "0 so far · counting since Sep 15"
 *   counted      a number and its matched baseline     → "41 · was 13 in the same days before"
 * plus not_counted, the honest answer for a number the product cannot read at all.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { measure, matchedBaseline, today, shiftDays, hasGoogle, hasFoodOrders, locationCount } from './metrics'
import { TAKEN_BY_WORD, type MetricKey, type TakenBy } from './registry'
import { lineFor, STATE_RANK, type PromiseState } from './lines'

// The seven states, and their words, live in ./lines — pure and client-safe, so the card, the
// "your count is in" cron and a script all read one table instead of three copies of it.
export { lineFor, PILL_FOR, ACTION_FOR, DONE_STATES, STATE_RANK, type PromiseState } from './lines'

export interface PromiseRow {
  id: string
  label: string
  /** the promise carried onto the campaign card through its life: "Counted after: taps on your Google card · on Home Oct 8" → "Counting · 6 of 14 days" → "41 taps · was 13" */
  line: string
  /** the second line: what is counted, since when, who takes it */
  sub: string
  /** the big number or word on the right */
  value: string
  /** the small line under the number */
  small: string
  tone: 'up' | 'down' | 'flat' | 'wait' | 'done' | 'off'
  /** Where this order stands. See ./lines for the seven states and the words each one gets. */
  state: PromiseState
  campaignId: string | null
  requestId: string | null
  showsOn: string
  /** the delivered file or page, when the work landed and left something to open */
  openUrl: string | null
}

type Stored = {
  id: string; campaign_id: string | null; creative_request_id: string | null; service_id: string | null; label: string
  metric_key: MetricKey; metric_label: string; taken_by: TakenBy; state: string; reason: string | null
  ordered_on: string; start_on: string | null; count_from: string; shows_on: string; baseline_value: number | null; baseline_days: number | null
}

const fmt = (n: number) => n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US')
const md = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * Where the WORK behind one promise stands. Not the count — the making of the thing.
 *
 * The seven states a card can read all come from here plus the dates on the promise row:
 * ordered (nobody on it), in production (a name on it, started), delivered (it landed).
 */
export interface Landing {
  /** somebody's name is on the work order */
  assigned: boolean
  /** the work actually began */
  started: boolean
  /** it landed */
  delivered: boolean
  /** the owner-facing note under the word */
  note: string
  /** the delivered file or page, when there is one to open */
  openUrl: string | null
}

/** Money that went back on this order, in the words the stopped card prints. */
interface RefundLine { refundedCents: number }

/**
 * Every work order behind this client's promises, read in TWO queries.
 *
 * It used to be one query per promise row, inside the loop, and only for `delivered_files` rows —
 * so a Google service could be delivered and its card had no way to know, and a client with sixty
 * rows made sixty round trips. Read once, keyed both ways: campaign+service for the service lane,
 * request id for the desk lane.
 *
 * Best-effort: an unreadable lane leaves an empty map, and every card falls back to "Being made",
 * which is what it said before any of this existed.
 */
async function landingsFor(clientId: string): Promise<{ byService: Map<string, Landing>; byRequest: Map<string, Landing> }> {
  const a = createAdminClient()
  const byService = new Map<string, Landing>()
  const byRequest = new Map<string, Landing>()
  const [svc, creator] = await Promise.all([
    a.from('service_work_orders').select('campaign_id, service_id, status, assignee_id, started_at, proof_note, proof_url').eq('client_id', clientId).then((r) => r, () => ({ data: null })),
    a.from('creator_work_orders').select('campaign_piece_key, status, creator_id, delivered_url, started_at').eq('client_id', clientId).then((r) => r, () => ({ data: null })),
  ])
  for (const row of ((svc as { data: unknown }).data ?? []) as { campaign_id: string | null; service_id: string | null; status: string; assignee_id: string | null; started_at: string | null; proof_note: string | null; proof_url: string | null }[]) {
    if (!row.campaign_id || !row.service_id) continue
    const delivered = row.status === 'delivered'
    byService.set(`${row.campaign_id}|${row.service_id}`, {
      assigned: !!row.assignee_id,
      started: !!row.started_at || ['in_progress', 'blocked_client', 'blocked_gate', 'ready_for_client', 'delivered'].includes(row.status),
      delivered,
      note: delivered ? (row.proof_note || 'Delivered · open it') : row.status === 'blocked_client' ? 'Waiting on you' : 'Being made',
      openUrl: delivered ? row.proof_url : null,
    })
  }
  for (const row of ((creator as { data: unknown }).data ?? []) as { campaign_piece_key: string | null; status: string; creator_id: string | null; delivered_url: string | null; started_at: string | null }[]) {
    const key = row.campaign_piece_key ?? ''
    if (!key.startsWith('request:')) continue
    const delivered = row.status === 'delivered' || row.status === 'approved' || row.status === 'done'
    byRequest.set(key.slice('request:'.length), {
      assigned: !!row.creator_id,
      started: !!row.started_at || ['in_progress', 'delivered', 'approved', 'done'].includes(row.status),
      delivered,
      note: delivered ? 'Delivered · open it' : 'Being made',
      openUrl: delivered ? row.delivered_url : null,
    })
  }
  return { byService, byRequest }
}

/**
 * The landing for one stored promise row, or NULL when no work order stands behind it.
 *
 * Null matters. An owner-run line, a card-level fallback row and a pre-190 order all have no work
 * order, and saying "nobody is on it" about work nobody was ever supposed to do would be a lie. A
 * null landing means the dates decide the state, exactly as they did before.
 */
function landingOf(p: Stored, maps: { byService: Map<string, Landing>; byRequest: Map<string, Landing> }): Landing | null {
  if (p.campaign_id && p.service_id) return maps.byService.get(`${p.campaign_id}|${p.service_id}`) ?? null
  if (p.creative_request_id) return maps.byRequest.get(p.creative_request_id) ?? null
  return null
}

/**
 * The two things a card needs that live outside the promise: which campaigns were STOPPED, and what
 * money went back. One query each, per client. Best-effort — an unreadable read means no card ever
 * says "Stopped", which is the same as before this existed and never a wrong claim about money.
 */
async function stopsAndRefunds(clientId: string): Promise<{ stopped: Set<string>; refundByCampaign: Map<string, RefundLine>; refundByRequest: Map<string, RefundLine> }> {
  const a = createAdminClient()
  const stopped = new Set<string>()
  const refundByCampaign = new Map<string, RefundLine>()
  const refundByRequest = new Map<string, RefundLine>()
  const [camps, pays] = await Promise.all([
    a.from('campaigns').select('id, status').eq('client_id', clientId).then((r) => r, () => ({ data: null })),
    // select('*') so the request_id column being absent (pre-258) can never error the read.
    a.from('campaign_payments').select('*').eq('client_id', clientId).then((r) => r, () => ({ data: null })),
  ])
  for (const c of ((camps as { data: unknown }).data ?? []) as { id: string; status: string }[]) {
    if (c.status === 'stopped') stopped.add(c.id)
  }
  for (const p of ((pays as { data: unknown }).data ?? []) as Record<string, unknown>[]) {
    const back = Number(p.refunded_cents) || 0
    if (back <= 0) continue
    const line: RefundLine = { refundedCents: back }
    // The LARGEST refund on an order is the one worth naming; several partials on one order are
    // one story to the owner, not three lines.
    const cid = (p.campaign_id as string | null) ?? null
    const rid = (p.request_id as string | null) ?? null
    if (cid && (refundByCampaign.get(cid)?.refundedCents ?? 0) < back) refundByCampaign.set(cid, line)
    if (rid && (refundByRequest.get(rid)?.refundedCents ?? 0) < back) refundByRequest.set(rid, line)
  }
  return { stopped, refundByCampaign, refundByRequest }
}

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export async function getPromiseRows(clientId: string, limit = 3): Promise<PromiseRow[]> {
  const { data, error } = await createAdminClient().from('order_promises').select('*').eq('client_id', clientId).order('ordered_on', { ascending: false }).limit(60)
  if (error || !data) return []
  const t = today()
  const out: Omit<PromiseRow, 'line'>[] = []
  const google = await hasGoogle(clientId).catch(() => false)
  const foodOrders = google ? await hasFoodOrders(clientId).catch(() => false) : false
  const shops = await locationCount(clientId).catch(() => 0)
  // A Google count on a client with two shops is both shops added together; say so on the row.
  const bothShops = shops > 1 ? ' · both shops together' : ''
  // The work behind every promise, and the two facts that live outside it (stops, refunds), read
  // once per client instead of once per row.
  const [maps, stops] = await Promise.all([
    landingsFor(clientId).catch(() => ({ byService: new Map<string, Landing>(), byRequest: new Map<string, Landing>() })),
    stopsAndRefunds(clientId).catch(() => ({ stopped: new Set<string>(), refundByCampaign: new Map<string, RefundLine>(), refundByRequest: new Map<string, RefundLine>() })),
  ])
  for (const p of data as Stored[]) {
    const who = TAKEN_BY_WORD[p.taken_by] ?? ''
    const land = landingOf(p, maps)
    const base = { id: p.id, label: p.label, campaignId: p.campaign_id, requestId: p.creative_request_id, showsOn: p.shows_on, openUrl: land?.openUrl ?? null }

    // STOPPED wins over everything. The order is over; the only thing left to say is what happened
    // to the money, and only when money really moved.
    if (p.campaign_id && stops.stopped.has(p.campaign_id)) {
      const back = stops.refundByCampaign.get(p.campaign_id)
      out.push({ ...base, sub: back ? `Stopped · ${money(back.refundedCents)} sent back to your card` : 'Stopped · nothing new is running', value: 'Stopped', small: back ? 'refunded' : 'no new work', tone: 'off', state: 'stopped' }); continue
    }
    if (p.state === 'not_counted') {
      out.push({ ...base, sub: `Ordered ${md(p.ordered_on)} · ${p.reason ?? 'not counted yet'}`, value: 'Not counted', small: who, tone: 'off', state: 'not_counted' }); continue
    }
    if (p.start_on && p.start_on > t) {
      out.push({ ...base, sub: `Held · work starts ${md(p.start_on)} · counted: ${p.metric_label}`, value: md(p.start_on), small: 'starts', tone: 'wait', state: 'held' }); continue
    }
    // BEFORE THE WORK LANDS, and only where a real work order says so. No work order means nobody
    // was ever meant to make anything (an owner-run line, a card-level row), so the dates decide.
    if (land && !land.delivered) {
      const started = land.started && land.assigned
      out.push({
        ...base,
        sub: started ? `${p.metric_label} · your team is on it` : `Ordered ${md(p.ordered_on)} · your team starts it next`,
        value: started ? 'Being made' : 'Ordered',
        small: started ? land.note : 'nobody on it yet',
        tone: 'wait',
        state: started ? 'production' : 'ordered',
      }); continue
    }
    if (p.metric_key === 'delivered_files') {
      const done = !!land?.delivered
      out.push({ ...base, sub: `Ordered ${md(p.ordered_on)} · ${p.metric_label}`, value: done ? 'Done' : 'Making', small: done ? (land?.note ?? 'Delivered') : 'Being made', tone: done ? 'done' : 'wait', state: done ? 'delivered' : 'production' }); continue
    }
    // A Google count for a client with no Google yet is "connect Google", not "0 so far". It flips
    // to counting the day rows appear, with no write.
    if ((p.metric_key === 'gbp_card_taps' || p.metric_key === 'gbp_impressions' || p.metric_key === 'gbp_food_orders') && !google) {
      out.push({ ...base, sub: `${p.metric_label} · connect your Google profile and this counts from then`, value: 'Not counted', small: 'Google not connected', tone: 'off', state: 'not_counted' }); continue
    }
    // Google's food-orders column exists but is empty for most listings. Never print a zero from it.
    if (p.metric_key === 'gbp_food_orders' && !foodOrders) {
      out.push({ ...base, sub: `${p.metric_label} · Google has not reported orders for your listing yet`, value: 'Not counted', small: 'nothing reported', tone: 'off', state: 'not_counted' }); continue
    }
    // A desk order's post cannot be traced to its published post today (the send-off rail keys
    // drafts by deliverable; a deliverable carries no order id). Say so; never "0 so far".
    if (p.metric_key === 'post_reach' && p.creative_request_id && !p.campaign_id) {
      out.push({ ...base, sub: `${p.metric_label} · counts once it is posted through your connected accounts`, value: '—', small: 'not posted through Apnosh yet', tone: 'wait', state: 'counting' }); continue
    }
    // The work landed but the count has not started yet. This is its own state, not "counting":
    // the owner should read "it is done, the number starts on the 12th", not a count with no days
    // in it. Re-anchoring on delivery is what makes this window real.
    if (p.count_from > t) {
      const landed = !!land?.delivered
      out.push({
        ...base,
        sub: landed ? `Delivered · ${p.metric_label} starts ${md(p.count_from)}` : `Ordered ${md(p.ordered_on)} · ${p.metric_label}`,
        value: landed ? 'Delivered' : '—',
        small: `counting from ${md(p.count_from)}`,
        tone: 'wait',
        state: landed ? 'delivered' : 'counting',
      }); continue
    }
    const cur = await measure(clientId, p.metric_key, p.count_from, t, p.campaign_id)
    if (p.metric_key === 'rating') {
      const before = p.baseline_value
      const now = cur.value
      if (now == null) { out.push({ ...base, sub: `${p.metric_label} · ${who}`, value: '—', small: `counting since ${md(p.count_from)}`, tone: 'wait', state: 'counting' }); continue }
      const moved = before != null && now !== before
      out.push({ ...base, sub: `${p.metric_label} · ${who}`, value: before != null ? `${before.toFixed(1)} → ${now.toFixed(1)}` : now.toFixed(1), small: moved ? (now > (before ?? 0) ? `▲ ${(now - (before ?? 0)).toFixed(1)}` : `▼ ${((before ?? 0) - now).toFixed(1)}`) : 'ratings move after about 20 new reviews', tone: moved ? (now > (before ?? 0) ? 'up' : 'down') : 'flat', state: t >= p.shows_on ? 'counted' : 'counting' }); continue
    }
    if (p.metric_key === 'post_reach' && (cur.value == null || cur.reportedDays === 0)) {
      out.push({ ...base, sub: `${p.metric_label} · counts once the posts go out through your connected accounts`, value: '—', small: 'no posts out yet', tone: 'wait', state: 'counting' }); continue
    }
    if (cur.value == null || cur.reportedDays === 0) {
      out.push({ ...base, sub: `${p.metric_label} since ${md(p.count_from)} · ${who}`, value: '0 so far', small: `counting since ${md(p.count_from)}`, tone: 'wait', state: 'counting' }); continue
    }
    const b = await matchedBaseline(clientId, p.metric_key, p.count_from, cur.reportedDays).catch(() => ({ value: p.baseline_value, reportedDays: p.baseline_days ?? 0 }))
    const before = b.value ?? p.baseline_value
    const isGoogle = p.metric_key === 'gbp_card_taps' || p.metric_key === 'gbp_impressions' || p.metric_key === 'gbp_food_orders'
    const sinceText = p.metric_key === 'post_reach' ? `${p.metric_label}` : `${p.metric_label} since ${md(p.count_from)}${isGoogle ? bothShops : ''}`
    if (before == null) {
      out.push({ ...base, sub: `${sinceText} · ${who}`, value: fmt(cur.value), small: 'first count, nothing before', tone: 'flat', state: t >= p.shows_on ? 'counted' : 'counting' }); continue
    }
    const tone: PromiseRow['tone'] = cur.value > before ? 'up' : cur.value < before ? 'down' : 'flat'
    const arrow = tone === 'up' ? '▲' : tone === 'down' ? '▼' : '='
    const small = p.metric_key === 'post_reach' ? `${arrow} your usual post: ${fmt(before)} · ${cur.reportedDays} posts` : `${arrow} was ${fmt(before)} in the same ${cur.reportedDays} days before`
    out.push({ ...base, sub: `${sinceText} · ${who}`, value: fmt(cur.value), small, tone, state: t >= p.shows_on ? 'counted' : 'counting' })
  }
  // Newest first, but a counted row with a number outranks a row that is only waiting, and a
  // stopped order sinks below everything still running.
  const rank = (r: PromiseRow) => STATE_RANK[r.state] ?? 8
  const withLine = out.map((r) => ({ ...r, line: lineFor(r) }))
  return (limit > 0 ? withLine.sort((a, b) => rank(a) - rank(b)).slice(0, limit) : withLine)
}


/** Desk orders (creative_requests placed as orders) for the Campaigns feed: they have no campaign
 *  row, so the list would otherwise never show them. Joined to their ledger row when one exists. */
export interface DeskOrderRow {
  id: string
  type: string
  label: string
  orderedOn: string
  status: string
  dueDate: string | null
  workStatus: string | null
  line: string | null
}
export async function getDeskOrders(clientId: string): Promise<DeskOrderRow[]> {
  const a = createAdminClient()
  const { data, error } = await a.from('creative_requests').select('id, type, status, created_at, due_date, accepted_at, quote_cents').eq('client_id', clientId).not('accepted_at', 'is', null).order('created_at', { ascending: false }).limit(30)
  if (error || !data) return []
  const ids = (data as { id: string }[]).map((r) => r.id)
  const { data: wos } = ids.length ? await a.from('creator_work_orders').select('campaign_piece_key, status').in('campaign_piece_key', ids.map((i) => `request:${i}`)) : { data: [] as unknown[] }
  const woByReq = new Map<string, string>()
  for (const w of (wos ?? []) as { campaign_piece_key: string; status: string }[]) woByReq.set(w.campaign_piece_key.replace(/^request:/, ''), w.status)
  const { requestTypeById } = await import('@/lib/requests/catalog')
  return (data as { id: string; type: string; status: string; created_at: string; due_date: string | null }[]).map((r) => ({
    id: r.id, type: r.type, label: requestTypeById(r.type)?.label ?? r.type,
    orderedOn: r.created_at.slice(0, 10), status: r.status, dueDate: r.due_date, workStatus: woByReq.get(r.id) ?? null, line: null,
  }))
}

export { shiftDays }
