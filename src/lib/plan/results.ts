/**
 * THE RESULTS ENGINE (owner 2026-09-17, "a results engine before more plans").
 * ==========================================================================
 * Every plan the sheets make (announcements.plan) is a list of lines with a date and the id of the
 * thing each became. Until now nothing ever came back to say what happened. This fills each line
 * with its outcome from what we already collect, so the check-in line and Coming up say
 * something true:
 *   a post        views, likes, comments from social_posts (by the vendor id we stored)
 *   a draft       published or not, and the post's numbers once it is
 *   a request     delivered, in progress, or waiting for the card
 *   the check-in  reviews: the listing's count now against the baseline we kept
 *                 anything else: the views across every post the plan made
 *   how it did    the views across the plan's posts, once its date has passed
 * Nothing here estimates. A line with no data keeps its status and gets no outcome.
 */
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
export interface Outcome { text: string; n?: number; at: string }
export interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string; outcome?: Outcome }

const today = () => new Date().toISOString().slice(0, 10)
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmt = (n: number) => n.toLocaleString('en-US')

export async function fillPlanResults(admin: Admin, opts: { clientId?: string } = {}): Promise<{ rows: number; lines: number; done: number }> {
  let q = admin.from('announcements').select('id, client_id, kind, answers, plan, status, created_at').in('status', ['planned', 'in_progress']).order('created_at', { ascending: false }).limit(500)
  if (opts.clientId) q = q.eq('client_id', opts.clientId)
  const { data: rows } = await q
  let lines = 0, done = 0
  const now = new Date().toISOString()
  const tday = today()
  for (const row of rows ?? []) {
    const plan = (Array.isArray(row.plan) ? row.plan : []) as Line[]
    if (!plan.length) continue
    const clientId = String(row.client_id)
    const answers = (row.answers ?? {}) as Record<string, string>
    /* the posts this plan made, by the vendor id on the line */
    const postIds = plan.map((l) => (l.ref?.kind === 'post' && l.ref.id ? l.ref.id : null)).filter((x): x is string => !!x)
    const draftIds = plan.map((l) => (l.ref?.kind === 'draft' && l.ref.id ? l.ref.id : null)).filter((x): x is string => !!x)
    const requestIds = plan.map((l) => (l.ref?.kind === 'request' && l.ref.id ? l.ref.id : null)).filter((x): x is string => !!x)
    const bookingIds = Array.from(new Set(plan.map((l) => (l.ref?.kind === 'booking' && l.ref.id ? l.ref.id : null)).filter((x): x is string => !!x)))
    const [posts, drafts, requests, loc, bks, cposts] = await Promise.all([
      postIds.length ? admin.from('social_posts').select('external_id, reach, likes, comments, total_interactions, posted_at').eq('client_id', clientId).in('external_id', postIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      draftIds.length ? admin.from('content_drafts').select('id, status, published_post_id').in('id', draftIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      requestIds.length ? admin.from('creative_requests').select('id, status').in('id', requestIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      row.kind === 'reviews' ? admin.from('gbp_locations').select('place_rating_count, is_primary').eq('client_id', clientId) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bookingIds.length ? admin.from('bookings').select('id, status, slot_date').in('id', bookingIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      bookingIds.length ? admin.from('creator_posts').select('booking_id, url, views, likes, saves, comments, posted_at').in('booking_id', bookingIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const byBooking = new Map<string, Record<string, unknown>>()
    for (const b of ((bks.data ?? []) as Record<string, unknown>[])) byBooking.set(String(b.id), b)
    const collabPost = new Map<string, Record<string, unknown>>()
    for (const c of ((cposts.data ?? []) as Record<string, unknown>[])) collabPost.set(String(c.booking_id), c)
    const byPost = new Map<string, Record<string, unknown>>()
    for (const p of (posts.data ?? []) as Record<string, unknown>[]) byPost.set(String(p.external_id), p)
    const byDraft = new Map<string, Record<string, unknown>>()
    for (const d of (drafts.data ?? []) as Record<string, unknown>[]) byDraft.set(String(d.id), d)
    const byReq = new Map<string, string>()
    for (const r of (requests.data ?? []) as Record<string, unknown>[]) byReq.set(String(r.id), String(r.status))
    /* a draft that published has a vendor post id we can also read */
    const publishedIds = Array.from(byDraft.values()).map((d) => (d.published_post_id ? String(d.published_post_id) : null)).filter((x): x is string => !!x && !byPost.has(x))
    if (publishedIds.length) {
      const { data: more } = await admin.from('social_posts').select('external_id, reach, likes, comments, total_interactions, posted_at').eq('client_id', clientId).in('external_id', publishedIds)
      for (const p of (more ?? []) as Record<string, unknown>[]) byPost.set(String(p.external_id), p)
    }
    const postText = (p: Record<string, unknown>) => { const v = num(p.reach), l = num(p.likes), c = num(p.comments); return v > 0 || l > 0 || c > 0 ? `${fmt(v)} views · ${fmt(l)} likes · ${fmt(c)} comments` : 'Posted. Numbers still counting' }
    let totalViews = 0, counted = 0
    for (const p of byPost.values()) { totalViews += num(p.reach); counted += 1 }

    let changed = false
    const next = plan.map((l): Line => {
      lines += 1
      const out: Line = { ...l }
      const passed = !!l.date && l.date <= tday
      if (l.ref?.kind === 'post' && l.ref.id) {
        const p = byPost.get(l.ref.id)
        if (p) { out.status = 'done'; out.outcome = { text: postText(p), n: num(p.reach), at: now } }
      } else if (l.ref?.kind === 'draft' && l.ref.id) {
        const d = byDraft.get(l.ref.id)
        if (d && String(d.status) === 'published') {
          out.status = 'done'
          const p = d.published_post_id ? byPost.get(String(d.published_post_id)) : null
          out.outcome = { text: p ? postText(p) : 'Posted by the team', n: p ? num(p.reach) : undefined, at: now }
        } else if (d && String(d.status) === 'rejected') { out.outcome = { text: 'The team set this one aside', at: now } }
      } else if (l.ref?.kind === 'request' && l.ref.id) {
        const st = byReq.get(l.ref.id)
        if (st === 'delivered' || st === 'closed') { out.status = 'done'; out.outcome = { text: 'Delivered', at: now } }
        else if (st === 'awaiting_payment') out.status = 'needs_payment'
        else if (st === 'in_progress' || st === 'requested' || st === 'quoted' || st === 'accepted' || st === 'in_review') out.status = 'with_team'
        else if (st === 'declined') { out.status = 'done'; out.outcome = { text: 'Declined', at: now } }
      } else if (l.ref?.kind === 'booking' && l.ref.id) {
        /* a creator collab: the booking's own state, and the post once the creator files it */
        const b = byBooking.get(l.ref.id); const cp = collabPost.get(l.ref.id)
        const st = b ? String(b.status) : null
        if (l.key === 'ask') { if (st === 'confirmed' || st === 'completed') { out.status = 'done'; out.outcome = { text: 'They said yes', at: now } } else if (st === 'cancelled') { out.status = 'done'; out.outcome = { text: 'Cancelled', at: now } } }
        else if (l.key === 'visit') { if (st === 'completed' || (st === 'confirmed' && passed)) { out.status = 'done'; out.outcome = { text: 'Visited', at: now } } else if (st === 'cancelled') { out.status = 'done'; out.outcome = { text: 'Cancelled', at: now } } }
        else if (l.key === 'post' && cp) { out.status = 'done'; out.outcome = { text: cp.views != null ? `Up. ${fmt(num(cp.views))} views · ${fmt(num(cp.likes))} likes · ${fmt(num(cp.saves))} saves` : 'Up. Numbers still counting', n: num(cp.views), at: now } }
        else if (l.key === 'results' && cp && passed) { out.status = 'done'; out.outcome = { text: `${fmt(num(cp.views))} views · ${fmt(num(cp.likes))} likes · ${fmt(num(cp.saves))} saves · ${fmt(num(cp.comments))} comments on their post`, n: num(cp.views), at: now } }
        else if (l.key === 'paid' && cp && passed) { out.status = 'done'; out.outcome = { text: 'Paid after the post', at: now } }
      } else if (l.key === 'checkin' && passed) {
        if (row.kind === 'reviews') {
          const rows_ = (loc.data ?? []) as { place_rating_count: number | null; is_primary?: boolean }[]
          const cur = rows_.find((r) => r.is_primary) ?? rows_[0]
          const nowCount = cur?.place_rating_count ?? null
          const base = Number(answers.baseline); const goal = Number(answers.goal)
          if (nowCount != null && Number.isFinite(base)) { const delta = nowCount - base; out.status = 'done'; out.outcome = { text: `${delta >= 0 ? '+' : ''}${fmt(delta)} reviews in 30 days${Number.isFinite(goal) ? `, the goal was ${goal}` : ''}. ${fmt(nowCount)} now`, n: delta, at: now } }
        } else if (counted > 0) {
          out.status = 'done'; out.outcome = { text: `${fmt(totalViews)} views across ${counted} post${counted === 1 ? '' : 's'}. No register connected, so sales are not counted here`, n: totalViews, at: now }
        }
      } else if (l.key === 'results' && passed && counted > 0) {
        out.status = 'done'; out.outcome = { text: `${fmt(totalViews)} views across ${counted} post${counted === 1 ? '' : 's'}`, n: totalViews, at: now }
      }
      if (out.status !== l.status || (out.outcome && !l.outcome) || (out.outcome && l.outcome && out.outcome.text !== l.outcome.text)) changed = true
      if (out.status === 'done') done += 1
      return out
    })
    const allSettled = next.every((l) => l.status === 'done' || (l.status === 'later' && !!l.date && l.date < tday))
    const status = allSettled ? 'done' : 'in_progress'
    if (changed || status !== row.status) await admin.from('announcements').update({ plan: next, status, updated_at: now }).eq('id', row.id)
  }
  return { rows: (rows ?? []).length, lines, done }
}
