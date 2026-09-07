import 'server-only'
/**
 * promises/read — the "Counted, as promised" rows for one client, in the words Home prints.
 *
 * Read ALWAYS: a flat month shows "41, was 41", a drop shows the drop. The state machine:
 *   held         start date in the future             → "Starts Jan 20"
 *   not_counted  the product cannot take this count   → the card's own reason
 *   done         a deliverable's work order delivered → "Done" + the handoff
 *   counting     before shows_on, or no reported days → "0 so far · counting since Sep 15"
 *   counted      a number and its matched baseline    → "41 · was 13 in the same days before"
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { measure, matchedBaseline, today, shiftDays } from './metrics'
import { TAKEN_BY_WORD, type MetricKey, type TakenBy } from './registry'

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
  state: 'held' | 'counting' | 'counted' | 'not_counted' | 'done'
  campaignId: string | null
  requestId: string | null
  showsOn: string
}

type Stored = {
  id: string; campaign_id: string | null; creative_request_id: string | null; service_id: string | null; label: string
  metric_key: MetricKey; metric_label: string; taken_by: TakenBy; state: string; reason: string | null
  ordered_on: string; start_on: string | null; count_from: string; shows_on: string; baseline_value: number | null; baseline_days: number | null
}

const fmt = (n: number) => n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US')
const md = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

async function deliveredState(p: Stored): Promise<{ done: boolean; note: string }> {
  const a = createAdminClient()
  if (p.campaign_id && p.service_id) {
    const { data } = await a.from('service_work_orders').select('status, proof_note').eq('campaign_id', p.campaign_id).eq('service_id', p.service_id).limit(1).maybeSingle()
    const r = data as { status?: string; proof_note?: string | null } | null
    if (r?.status === 'delivered') return { done: true, note: r.proof_note || 'In your Photos and files' }
    return { done: false, note: r?.status === 'blocked_client' ? 'Waiting on you' : 'Being made' }
  }
  if (p.creative_request_id) {
    const { data } = await a.from('creator_work_orders').select('status').eq('campaign_piece_key', `request:${p.creative_request_id}`).limit(1).maybeSingle()
    const s = (data as { status?: string } | null)?.status
    if (s === 'delivered' || s === 'approved' || s === 'done') return { done: true, note: 'In your Photos and files' }
    return { done: false, note: 'Being made' }
  }
  return { done: false, note: 'Being made' }
}

export async function getPromiseRows(clientId: string, limit = 3): Promise<PromiseRow[]> {
  const { data, error } = await createAdminClient().from('order_promises').select('*').eq('client_id', clientId).order('ordered_on', { ascending: false }).limit(limit > 0 ? 12 : 60)
  if (error || !data) return []
  const t = today()
  const out: Omit<PromiseRow, 'line'>[] = []
  for (const p of data as Stored[]) {
    const who = TAKEN_BY_WORD[p.taken_by] ?? ''
    const base = { id: p.id, label: p.label, campaignId: p.campaign_id, requestId: p.creative_request_id, showsOn: p.shows_on }
    if (p.state === 'not_counted') {
      out.push({ ...base, sub: `Ordered ${md(p.ordered_on)} · ${p.reason ?? 'not counted yet'}`, value: 'Not counted', small: who, tone: 'off', state: 'not_counted' }); continue
    }
    if (p.start_on && p.start_on > t) {
      out.push({ ...base, sub: `Held · work starts ${md(p.start_on)} · counted: ${p.metric_label}`, value: md(p.start_on), small: 'starts', tone: 'wait', state: 'held' }); continue
    }
    if (p.metric_key === 'delivered_files') {
      const d = await deliveredState(p)
      out.push({ ...base, sub: `Ordered ${md(p.ordered_on)} · ${p.metric_label}`, value: d.done ? 'Done' : 'Making', small: d.note, tone: d.done ? 'done' : 'wait', state: d.done ? 'done' : 'counting' }); continue
    }
    if (p.count_from > t) {
      out.push({ ...base, sub: `Ordered ${md(p.ordered_on)} · ${p.metric_label}`, value: '—', small: `counting from ${md(p.count_from)}`, tone: 'wait', state: 'counting' }); continue
    }
    const cur = await measure(clientId, p.metric_key, p.count_from, t, p.campaign_id)
    if (p.metric_key === 'rating') {
      const before = p.baseline_value
      const now = cur.value
      if (now == null) { out.push({ ...base, sub: `${p.metric_label} · ${who}`, value: '—', small: `counting since ${md(p.count_from)}`, tone: 'wait', state: 'counting' }); continue }
      const moved = before != null && now !== before
      out.push({ ...base, sub: `${p.metric_label} · ${who}`, value: before != null ? `${before.toFixed(1)} → ${now.toFixed(1)}` : now.toFixed(1), small: moved ? (now > (before ?? 0) ? `▲ ${(now - (before ?? 0)).toFixed(1)}` : `▼ ${((before ?? 0) - now).toFixed(1)}`) : 'ratings move after about 20 new reviews', tone: moved ? (now > (before ?? 0) ? 'up' : 'down') : 'flat', state: t >= p.shows_on ? 'counted' : 'counting' }); continue
    }
    if (cur.value == null || cur.reportedDays === 0) {
      out.push({ ...base, sub: `${p.metric_label} since ${md(p.count_from)} · ${who}`, value: '0 so far', small: `counting since ${md(p.count_from)}`, tone: 'wait', state: 'counting' }); continue
    }
    const b = await matchedBaseline(clientId, p.metric_key, p.count_from, cur.reportedDays).catch(() => ({ value: p.baseline_value, reportedDays: p.baseline_days ?? 0 }))
    const before = b.value ?? p.baseline_value
    const sinceText = p.metric_key === 'post_reach' ? `${p.metric_label}` : `${p.metric_label} since ${md(p.count_from)}`
    if (before == null) {
      out.push({ ...base, sub: `${sinceText} · ${who}`, value: fmt(cur.value), small: 'first count, nothing before', tone: 'flat', state: t >= p.shows_on ? 'counted' : 'counting' }); continue
    }
    const tone: PromiseRow['tone'] = cur.value > before ? 'up' : cur.value < before ? 'down' : 'flat'
    const arrow = tone === 'up' ? '▲' : tone === 'down' ? '▼' : '='
    const small = p.metric_key === 'post_reach' ? `${arrow} your usual post: ${fmt(before)}` : `${arrow} was ${fmt(before)} in the same ${cur.reportedDays} days before`
    out.push({ ...base, sub: `${sinceText} · ${who}`, value: fmt(cur.value), small, tone, state: t >= p.shows_on ? 'counted' : 'counting' })
  }
  // Newest first, but a counted row with a number outranks a row that is only waiting.
  const rank = (r: PromiseRow) => (r.state === 'counted' ? 0 : r.state === 'done' ? 1 : r.state === 'counting' ? 2 : r.state === 'held' ? 3 : 4)
  const withLine = out.map((r) => ({ ...r, line: lineFor(r) }))
  return (limit > 0 ? withLine.sort((a, b) => rank(a) - rank(b)).slice(0, limit) : withLine)
}

/** The one line a Campaigns card prints under its pill, from the same row Home prints. */
function lineFor(r: Omit<PromiseRow, 'line'>): string {
  if (r.state === 'not_counted') return `Not counted: ${r.sub.replace(/^Ordered [^·]+· /, '')}`
  if (r.state === 'held') return `Held · work starts ${r.value} · then counted`
  if (r.state === 'done') return `Done · ${r.small}`
  if (r.state === 'counting') return r.value === '—' ? `Counted after: ${r.sub.replace(/^Ordered [^·]+· /, '')} · on Home ${md(r.showsOn)}` : `Counting · ${r.value} · on Home ${md(r.showsOn)}`
  return `${r.value} · ${r.small}`
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
