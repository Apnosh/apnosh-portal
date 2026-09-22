import 'server-only'
/**
 * THE PIECES (owner 2026-09-22, "rethink the campaigns page"): everything an owner has ordered or
 * planned, in one row shape, from every source, one row per real thing.
 *
 *   requests   creative_requests: a graphic, a video, the shoot day, print, posts, a logo, a site
 *   bookings   a creator visit
 *   posts      scheduled_posts
 *   slots      plan_slots that have not become a request yet (a started month), and a draft
 *              month's pieces greyed so next month is visible before it starts
 *   announce   an announcement is a campaign; its free lines (a taste, the team card) are pieces
 *   campaigns  the older campaigns, one row each
 *
 * A request wins over the slot that minted it; a booking wins over its slot. Every piece says
 * which campaign it belongs to: a holiday, the month, an announcement, an old campaign, or other.
 * Five state words for all of them: needs you, coming, with the team, live, done (and stopped).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { OCCASIONS } from '@/lib/design/occasions'
import { listCampaigns } from '@/lib/campaigns/server'
import { campaignCardVM } from '@/lib/campaigns/view'
import { CREATOR_GATE_KIND } from '@/lib/marketplace/creator-schedule'

type Admin = ReturnType<typeof createAdminClient>
export type PieceState = 'needs' | 'coming' | 'team' | 'live' | 'done' | 'stopped' | 'draft' | 'idea'
export interface PieceGroup { kind: 'occasion' | 'month' | 'announce' | 'campaign' | 'other'; id: string; label: string; emoji?: string }
export interface Piece { fill?: 'open' | 'set' | 'locked' | 'done'; subject?: string | null; slotId?: string; id: string; source: 'request' | 'booking' | 'post' | 'slot' | 'free' | 'campaign'; kind: string; label: string; detail: string; date: string | null; allMonth: boolean; state: PieceState; cents: number | null; href: string | null; group: PieceGroup; month: string | null; /** a planned piece the plan still owns: can be taken off */ drop?: { month: string; key: string } | null }

const KIND_OF_TYPE: Record<string, string> = { graphic: 'graphic', video: 'reel', photos: 'photos', print: 'print', social: 'post', logo: 'brand', website: 'site', email: 'email', ads: 'ad', menu: 'menu', copy: 'post', other: 'else' }
const LABEL_OF_TYPE: Record<string, string> = { graphic: 'Graphic', video: 'Video', photos: 'Shoot day', print: 'Print', social: 'Posts', logo: 'Branding', website: 'Website', email: 'Email', ads: 'Ads', menu: 'Menu', copy: 'Copy', other: 'Request' }
const MONTH_NAME = (m: string) => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export async function listPieces(admin: Admin, clientId: string, from: string, to: string): Promise<Piece[]> {
  const out: Piece[] = []
  const covered = new Set<string>() // request:<id> / booking:<id> already carried by a plan slot or an announcement
  const groupOf = new Map<string, PieceGroup>() // request:<id> → the campaign it belongs to

  /* ── the plan's months in range, and their slots ── */
  const months = await admin.from('plan_months').select('id, month, status, thesis').eq('client_id', clientId).gte('month', from.slice(0, 7)).lte('month', to.slice(0, 7)).then((r) => (r.error ? [] : ((r.data ?? []) as { id: string; month: string; status: string; thesis: string | null }[]).map((m) => ({ ...m, subject: m.thesis && !/^Get |^More people/i.test(m.thesis) ? m.thesis : null }))))
  if (months.length) {
    let slots: unknown[] | null = (await admin.from('plan_slots').select('id, plan_month_id, date, stage, kind, label, options, cents, status, ref, why, fill, subject, campaign').in('plan_month_id', months.map((m) => m.id)).neq('status', 'removed').neq('status', 'rolled')).data
    if (!slots) slots = (await admin.from('plan_slots').select('id, plan_month_id, date, stage, kind, label, options, cents, status, ref, why').in('plan_month_id', months.map((m) => m.id)).neq('status', 'removed').neq('status', 'rolled')).data // before 272
    for (const s of (slots ?? []) as { id: string; plan_month_id: string; date: string; kind: string; label: string | null; options: Record<string, unknown>; cents: number; status: string; ref: { kind?: string; id?: string | null; href?: string } | null; fill?: 'open' | 'set' | 'locked' | 'done'; subject?: string | null; campaign?: string | null }[]) {
      const pm = months.find((m) => m.id === s.plan_month_id)!
      const occ = typeof s.options?.occasion === 'string' ? OCCASIONS.find((o) => o.id === s.options.occasion) : null
      const group: PieceGroup = occ ? { kind: 'occasion', id: occ.id, label: occ.name, emoji: occ.emoji } : { kind: 'month', id: pm.month, label: pm.subject ?? MONTH_NAME(pm.month) }
      const allMonth = (s.kind === 'taste' || s.kind === 'review' || s.kind === 'team' || s.kind === 'sign') && s.status !== 'draft'
      if (s.ref?.id && (s.ref.kind === 'request' || s.ref.kind === 'booking')) { groupOf.set(`${s.ref.kind}:${s.ref.id}`, group); continue } // the request or booking carries it
      const draft = pm.status === 'draft'
      out.push({ slotId: s.id, fill: s.fill ?? (s.status === 'done' ? 'done' : s.kind === 'post' || s.kind === 'graphic' || s.kind === 'reel' ? 'open' : 'set'), subject: s.subject ?? null, id: `slot:${s.id}`, source: allMonth ? 'free' : 'slot', kind: s.kind, label: s.label ?? s.kind, detail: s.subject ?? (s.fill === 'open' || (!s.fill && (s.kind === 'post' || s.kind === 'graphic' || s.kind === 'reel')) ? 'open · yours to fill' : ''), date: allMonth ? null : (s.date ?? null), allMonth, state: s.status === 'draft' ? 'idea' : draft ? 'draft' : s.status === 'done' ? 'done' : 'coming', cents: s.cents || null, href: `/dashboard/campaigns?month=${pm.month}`, group, month: pm.month, drop: s.status === 'planned' && !draft ? { month: pm.month, key: s.id } : null })
    }
  }

  /* ── announcements: each is a campaign; its lines point at the real things ── */
  try {
    const { data: anns } = await admin.from('announcements').select('id, kind, answers, plan, status, timing, created_at').eq('client_id', clientId).in('status', ['planned', 'in_progress', 'done']).gte('created_at', new Date(Date.parse(from) - 60 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(40)
    for (const a of (anns ?? []) as { id: string; kind: string; answers: Record<string, unknown>; plan: { key: string; label: string; detail?: string; date?: string | null; cost?: number | null; status?: string; ref?: { kind: string; id: string | null; href?: string } | null }[]; status: string; timing: Record<string, unknown> }[]) {
      if (a.kind === 'shoot') continue
      const name = typeof a.answers?.name === 'string' && a.answers.name ? String(a.answers.name) : ({ dish: 'A new dish', deal: 'A deal', event: 'An event', hours: 'Hours', hiring: 'Hiring', open: 'Opening', holiday: 'A holiday', slow: 'Slow night', post: 'A post', update: 'An update', else: 'News' } as Record<string, string>)[a.kind] ?? a.kind
      const group: PieceGroup = { kind: 'announce', id: a.id, label: name }
      for (const l of a.plan ?? []) {
        if (l.ref?.id && (l.ref.kind === 'request' || l.ref.kind === 'booking')) { groupOf.set(`${l.ref.kind}:${l.ref.id}`, group); continue }
        if (l.ref?.id && l.ref.kind === 'post') { groupOf.set(`post:${l.ref.id}`, group); continue }
        if (l.status === 'done' && !/taste|team|review|sign/i.test(l.key)) continue
        if (!/taste|team|review|sign|offer|apps/i.test(l.key)) continue
        const kind = /taste/i.test(l.key) ? 'taste' : /team/i.test(l.key) ? 'team' : /review/i.test(l.key) ? 'review' : /sign/i.test(l.key) ? 'sticky' : /offer/i.test(l.key) ? 'offer' : 'apps'
        out.push({ id: `ann:${a.id}:${l.key}`, source: 'free', kind, label: l.label, detail: l.detail ?? '', date: l.date ?? null, allMonth: !l.date, state: l.status === 'done' ? 'done' : 'coming', cents: null, href: l.ref?.href ?? '/dashboard/campaigns', group, month: l.date ? l.date.slice(0, 7) : null })
      }
    }
  } catch { /* 267 not on */ }

  /* ── requests: the desk ── */
  const { data: reqs } = await admin.from('creative_requests').select('id, type, status, created_at, due_date, quote_cents, answers').eq('client_id', clientId).or(`due_date.gte.${from},and(due_date.is.null,created_at.gte.${new Date(Date.parse(from) - 45 * 86400000).toISOString()})`).lte('created_at', to + 'T23:59:59').order('created_at', { ascending: false }).limit(120)
  const reqIds = ((reqs ?? []) as { id: string }[]).map((r) => r.id)
  const { data: wos } = reqIds.length ? await admin.from('creator_work_orders').select('campaign_piece_key, status').in('campaign_piece_key', reqIds.map((i) => `request:${i}`)) : { data: [] as unknown[] }
  const woStatus = new Map<string, string>(); for (const w of (wos ?? []) as { campaign_piece_key: string; status: string }[]) woStatus.set(w.campaign_piece_key.replace(/^request:/, ''), w.status)
  for (const r of (reqs ?? []) as { id: string; type: string; status: string; created_at: string; due_date: string | null; quote_cents: number | null; answers: Record<string, unknown> | null }[]) {
    if (['declined', 'cancelled'].includes(r.status)) continue
    const wo = woStatus.get(r.id)
    const state: PieceState = r.status === 'awaiting_payment' ? 'needs' : ['delivered', 'closed'].includes(r.status) || ['delivered', 'approved', 'done'].includes(String(wo ?? '')) ? 'done' : 'team'
    const what = typeof r.answers?.what === 'string' ? String(r.answers.what) : ''
    const date = r.due_date ? r.due_date.slice(0, 10) : null
    const group = groupOf.get(`request:${r.id}`) ?? { kind: 'other' as const, id: 'other', label: 'Other work' }
    out.push({ id: `request:${r.id}`, source: 'request', kind: KIND_OF_TYPE[r.type] ?? 'else', label: r.type === 'photos' ? 'Shoot day' : what ? what.slice(0, 48) : LABEL_OF_TYPE[r.type] ?? r.type, detail: [LABEL_OF_TYPE[r.type] ?? r.type, state === 'needs' ? 'waiting on payment' : state === 'team' ? (wo ? 'someone is on it' : 'with the desk') : 'delivered'].join(' · '), date, allMonth: false, state, cents: r.quote_cents ?? null, href: `/dashboard/requests/${r.id}`, group, month: (date ?? r.created_at.slice(0, 10)).slice(0, 7) })
    covered.add(`request:${r.id}`)
  }

  /* ── bookings: creator visits ── */
  try {
    const { data: bks } = await admin.from('bookings').select('id, status, slot_date, note, created_at').eq('client_id', clientId).eq('gate_kind', CREATOR_GATE_KIND).gte('created_at', new Date(Date.parse(from) - 60 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(40)
    for (const b of (bks ?? []) as { id: string; status: string; slot_date: string | null; note: string | null; created_at: string }[]) {
      let meta: { collab?: boolean; vendorSlug?: string; listingTitle?: string; vendorName?: string } = {}
      try { meta = JSON.parse(b.note ?? '{}') } catch { /* not ours */ }
      if (!meta.collab) continue
      if (['cancelled', 'declined'].includes(b.status)) continue
      const date = b.slot_date ?? null
      const past = date ? date < ymd(new Date()) : false
      const state: PieceState = b.status === 'held' ? 'coming' : past ? 'done' : 'coming'
      const who = meta.vendorName ?? (meta.vendorSlug ? meta.vendorSlug.replace(/^example-/, '').split('-')[0].replace(/^\w/, (c) => c.toUpperCase()) : 'The creator')
      out.push({ id: `booking:${b.id}`, source: 'booking', kind: 'creator', label: `${who} visits`, detail: b.status === 'held' ? 'waiting on their yes' : meta.listingTitle ?? 'a visit and a post', date, allMonth: false, state, cents: null, href: `/dashboard/bookings/${b.id}`, group: groupOf.get(`booking:${b.id}`) ?? { kind: 'other', id: 'other', label: 'Other work' }, month: (date ?? b.created_at.slice(0, 10)).slice(0, 7) })
    }
  } catch { /* no bookings table */ }

  /* ── scheduled posts ── */
  try {
    const { data: posts } = await admin.from('scheduled_posts').select('id, text, status, scheduled_for, platforms').eq('client_id', clientId).not('scheduled_for', 'is', null).gte('scheduled_for', from + 'T00:00:00').lte('scheduled_for', to + 'T23:59:59').order('scheduled_for').limit(200)
    for (const p of (posts ?? []) as { id: string; text: string | null; status: string; scheduled_for: string; platforms: string[] | null }[]) {
      const date = p.scheduled_for.slice(0, 10)
      const state: PieceState = ['posted', 'published', 'sent'].includes(p.status) ? 'done' : ['failed', 'error'].includes(p.status) ? 'needs' : ['draft', 'pending', 'needs_approval'].includes(p.status) ? 'needs' : 'coming'
      out.push({ id: `post:${p.id}`, source: 'post', kind: 'post', label: 'A post', detail: `${(p.platforms ?? []).join(', ') || 'social'}${p.text ? ` · ${p.text.slice(0, 40)}` : ''}`, date, allMonth: false, state, cents: null, href: '/dashboard/insights/coming-up', group: groupOf.get(`post:${p.id}`) ?? { kind: 'month', id: date.slice(0, 7), label: MONTH_NAME(date.slice(0, 7)) }, month: date.slice(0, 7) })
    }
  } catch { /* no posts */ }

  /* ── the older campaigns, one row each ── */
  try {
    const camps = await listCampaigns(clientId)
    for (const c of camps) {
      const card = campaignCardVM(c)
      if (card.kind === 'draft') continue
      const date = (c.draft as { launchDate?: string | null }).launchDate ?? null
      out.push({ id: `campaign:${c.draft.id}`, source: 'campaign', kind: 'google', label: card.title, detail: card.pill + (card.blurb ? ` · ${card.blurb}` : ''), date, allMonth: false, state: card.kind === 'live' ? 'live' : 'done', cents: null, href: card.href, group: { kind: 'campaign', id: c.draft.id, label: card.title }, month: date ? date.slice(0, 7) : null })
    }
  } catch { /* none */ }

  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
}
