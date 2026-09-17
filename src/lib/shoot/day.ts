/**
 * The shoot day (owner 2026-09-17: "a shoot would include multiple campaigns").
 *
 * A shoot is booked once and filled over a week. It is a photos order at the desk (the money,
 * the photographer, the day) plus an announcements row of kind 'shoot' that remembers what is
 * on it: the plans attached, the spots the tier allows, and the shot list the team carries.
 *
 * Spots come from the desk's own tiers: one focus (1), full house up to three areas (3), the
 * works (5). Attaching past the room does not refuse and does not charge: it adds a line that
 * says which tier this now needs and what that costs, and the team confirms before the day.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest } from '@/lib/requests/create'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { notifyStaffForClient } from '@/lib/notifications'

type Admin = ReturnType<typeof createAdminClient>

export type ShootTier = 'standard' | 'full' | 'works'
export const TIERS: ShootTier[] = ['standard', 'full', 'works']
export const SPOTS: Record<ShootTier, number> = { standard: 1, full: 3, works: 5 }
export const TIER_LABEL: Record<ShootTier, string> = { standard: 'One focus', full: 'Full house', works: 'The works' }
export const TIER_SMALL: Record<ShootTier, string> = { standard: '1 spot, 15 photos, one visit', full: '3 spots, 25 photos, food, space and team', works: '5 spots, 40 photos plus social crops, a senior photographer' }
const TIER_ANSWERS: Record<ShootTier, Record<string, string>> = {
  standard: { what: 'Food and dishes', use: 'Social media, Google and Yelp, Menus', level: 'Standard', when: 'In 2 weeks' },
  full: { what: 'Food and dishes, The space, The team', use: 'Social media, Google and Yelp, Website, Menus', level: 'Standard', when: 'In 2 weeks' },
  works: { what: 'Food and dishes, The space, The team', use: 'Social media, Google and Yelp, Website, Menus', level: 'The works', when: 'In 2 weeks' },
}
export const tierCents = (t: ShootTier): number | null => priceCreativeRequest('photos', TIER_ANSWERS[t])?.totalCents ?? null
export const asTier = (v: unknown, fallback: ShootTier = 'standard'): ShootTier => (TIERS.includes(v as ShootTier) ? (v as ShootTier) : fallback)

export interface Attached { label: string; kind: string; planId: string | null; pieces: string[]; at: string }
export interface Shoot { id: string; requestId: string | null; date: string | null; tier: ShootTier; tierLabel: string; spots: number; used: number; left: number; attached: Attached[]; cents: number | null; status: string; needs: ShootTier | null; upgradeCents: number | null; href: string | null }
export interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

export const dayIso = (d: Date) => d.toISOString().slice(0, 10)
const clean = (s: unknown, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const nextTier = (t: ShootTier): ShootTier | null => (t === 'standard' ? 'full' : t === 'full' ? 'works' : null)

export function shapeShoot(row: Record<string, unknown>): Shoot {
  const pic = (row.picture ?? {}) as Record<string, unknown>
  const timing = (row.timing ?? {}) as Record<string, unknown>
  const places = (row.places ?? {}) as Record<string, unknown>
  const tier = asTier(pic.tier)
  const attached = (Array.isArray(pic.attached) ? pic.attached : []) as Attached[]
  const used = attached.length
  const spots = SPOTS[tier]
  let needs: ShootTier | null = null
  if (used > spots) { let t: ShootTier | null = tier; while (t && used > SPOTS[t]) t = nextTier(t); needs = t }
  const up = needs ? tierCents(needs) : null
  const cur = tierCents(tier)
  const requestId = typeof places.requestId === 'string' ? places.requestId : null
  return { id: String(row.id), requestId, date: typeof timing.date === 'string' ? timing.date : null, tier, tierLabel: TIER_LABEL[tier], spots, used, left: Math.max(0, spots - used), attached, cents: typeof row.total_cents === 'number' ? row.total_cents : null, status: String(row.status), needs, upgradeCents: up != null && cur != null ? up - cur : null, href: requestId ? `/dashboard/requests/${requestId}` : null }
}

/** the one open shoot: booked, not yet shot (no date, or a date still ahead) */
export async function openShoot(admin: Admin, clientId: string): Promise<Shoot | null> {
  const { data } = await admin.from('announcements').select('*').eq('client_id', clientId).eq('kind', 'shoot').in('status', ['planned', 'in_progress']).order('created_at', { ascending: false }).limit(5)
  const today = dayIso(new Date())
  const rows = (data ?? []) as Record<string, unknown>[]
  const row = rows.find((r) => { const t = (r.timing ?? {}) as Record<string, unknown>; return !t.date || String(t.date) >= today })
  return row ? shapeShoot(row) : null
}

/** upcoming plans that could ride on the day ("while we are there") */
export async function shootSuggestions(admin: Admin, clientId: string, attached: Attached[]) {
  const { data } = await admin.from('announcements').select('id, kind, answers, timing, created_at').eq('client_id', clientId).in('status', ['planned', 'in_progress']).not('kind', 'in', '(shoot,request,reviews,ads,influencers)').order('created_at', { ascending: false }).limit(12)
  const have = new Set(attached.map((a) => a.planId).filter(Boolean))
  return ((data ?? []) as Record<string, unknown>[]).filter((r) => !have.has(String(r.id))).map((r) => { const a = (r.answers ?? {}) as Record<string, unknown>; const t = (r.timing ?? {}) as Record<string, unknown>; return { id: String(r.id), kind: String(r.kind), label: String(a.what ?? '').slice(0, 60) || String(r.kind), date: typeof t.at === 'string' ? t.at.slice(0, 10) : null } })
}

/** the team's copy of the shot list rides on the photos request */
async function syncShotList(admin: Admin, requestId: string | null, attached: Attached[], needs: ShootTier | null) {
  if (!requestId) return
  const { data: r } = await admin.from('creative_requests').select('brief, team_note').eq('id', requestId).maybeSingle()
  if (!r) return
  const brief = { ...((r.brief as Record<string, unknown>) ?? {}) }
  brief.dishes = attached.map((a, i) => `${i + 1}. ${a.label}${a.pieces.length ? ` (${a.pieces.join(', ')})` : ''}`).join('; ') || 'Shot list to follow from the plans attached to this day'
  const note = [`Shot list, ${attached.length} on the day:`, ...attached.map((a, i) => `${i + 1}. ${a.label} for the ${a.kind}${a.pieces.length ? `: ${a.pieces.join(', ')}` : ''}`), needs ? `NEEDS ${TIER_LABEL[needs]} now (${attached.length} spots). Confirm with the owner before the day.` : ''].filter(Boolean).join('\n')
  await admin.from('creative_requests').update({ brief, team_note: note }).eq('id', requestId)
}

export async function bookShoot(admin: Admin, o: { clientId: string; userId: string; tier: ShootTier; date: string | null; note?: string }): Promise<{ ok: true; shoot: Shoot; needsPayment: boolean; orderCents: number | null } | { ok: false; error: string; status: number }> {
  const { clientId, userId, tier, date } = o
  const note = clean(o.note, 300)
  const r = await createCreativeRequest({ clientId, userId, type: 'photos', order: true, due_date: date, answers: { ...TIER_ANSWERS[tier], dishes: note || 'Shot list to follow from the plans attached to this day', notes: 'A shoot day. Plans attach to it from Create; the shot list on this request is kept in step.' } })
  if (!r.ok) return { ok: false, error: r.error, status: r.status }
  const href = `/dashboard/requests/${r.row.id}`
  const plan: Line[] = [
    { key: 'book', label: r.needsPayment ? 'The day is held. Pay to book it' : 'The day is booked', detail: `${TIER_LABEL[tier]}: ${TIER_SMALL[tier]}`, date: dayIso(new Date()), cost: r.orderCents, status: r.needsPayment ? 'needs_payment' : 'with_team', ref: { kind: 'request', id: r.row.id, href }, why: 'One day feeds every plan you put on it' },
    { key: 'date', label: date ? 'Shoot day' : 'Pick the day', detail: date ? 'The photographer confirms the hour in your thread' : 'The team offers two dates in your thread', date, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href } },
    { key: 'delivered', label: 'Photos and clips in your library', detail: 'Tagged with the day, for every plan on it and the next ones', date: date ? dayIso(new Date(Date.parse(date) + 3 * 86400000)) : null, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href } },
  ]
  const { data: row, error } = await admin.from('announcements').insert({ client_id: clientId, kind: 'shoot', status: 'in_progress', answers: { what: 'A shoot day', tier: TIER_LABEL[tier] }, picture: { tier, attached: [] }, places: { requestId: r.row.id }, timing: { date }, plan, total_cents: r.orderCents ?? 0, created_by: userId }).select('*').single()
  if (error || !row) return { ok: false, error: 'The day was ordered but could not be saved as a shoot. The team has the order.', status: 500 }
  return { ok: true, shoot: shapeShoot(row as Record<string, unknown>), needsPayment: r.needsPayment, orderCents: r.orderCents }
}

export async function attachToShoot(admin: Admin, clientId: string, shootId: string, add: { label: string; kind: string; planId: string | null; pieces: string[] } | null, removeIndex?: number): Promise<Shoot | null> {
  const { data: row } = await admin.from('announcements').select('*').eq('id', shootId).eq('client_id', clientId).eq('kind', 'shoot').maybeSingle()
  if (!row) return null
  const cur = shapeShoot(row as Record<string, unknown>)
  let attached = cur.attached.slice()
  if (add) {
    const label = clean(add.label, 80)
    if (!label) return cur
    if (add.planId && attached.some((a) => a.planId === add.planId)) return cur
    attached.push({ label, kind: clean(add.kind, 20) || 'plan', planId: add.planId, pieces: add.pieces.map((p) => clean(p, 30)).filter(Boolean).slice(0, 6), at: new Date().toISOString() })
  } else if (removeIndex != null && Number.isInteger(removeIndex) && removeIndex >= 0 && removeIndex < attached.length) {
    attached = attached.filter((_, j) => j !== removeIndex)
  }
  const pic = { ...((row.picture as Record<string, unknown>) ?? {}), attached }
  const next = shapeShoot({ ...(row as Record<string, unknown>), picture: pic })
  const plan = ((Array.isArray(row.plan) ? row.plan : []) as Line[]).filter((l) => l.key !== 'upgrade' && l.key !== 'onit')
  if (attached.length) plan.splice(1, 0, { key: 'onit', label: `${attached.length} on the day`, detail: attached.map((a) => a.label).join(', '), date: cur.date, cost: null, status: 'later', ref: null })
  if (next.needs) {
    plan.push({ key: 'upgrade', label: `Needs ${TIER_LABEL[next.needs]} now`, detail: `${attached.length} on the day is more than ${TIER_LABEL[cur.tier]} holds. ${next.upgradeCents != null ? `+$${Math.round(next.upgradeCents / 100)}, ` : ''}the team confirms before the day`, date: cur.date, cost: next.upgradeCents, status: 'with_team', ref: cur.requestId ? { kind: 'request', id: cur.requestId, href: `/dashboard/requests/${cur.requestId}` } : null, why: 'Nothing is charged until you and the team agree the bigger day' })
    if (!cur.needs || cur.needs !== next.needs) notifyStaffForClient(clientId, ['strategist', 'designer'], { kind: 'client_request', title: `Shoot day now needs ${TIER_LABEL[next.needs]}`, body: `${attached.length} plans attached. Confirm the tier with the owner.`, link: '/admin/requests' }).catch(() => {})
  }
  await admin.from('announcements').update({ picture: pic, plan, updated_at: new Date().toISOString() }).eq('id', shootId)
  await syncShotList(admin, cur.requestId, attached, next.needs)
  return next
}

/** a photos order booked at the desk before shoot days existed becomes a shoot day the first
    time a plan asks to ride on it */
export async function adoptShoot(admin: Admin, clientId: string, userId: string, requestId: string): Promise<Shoot | null> {
  const { data: r } = await admin.from('creative_requests').select('id, due_date, brief, total_cents, status').eq('id', requestId).eq('client_id', clientId).eq('type', 'photos').maybeSingle()
  if (!r) return null
  const brief = (r.brief as Record<string, unknown>) ?? {}
  const tier: ShootTier = String(brief.level ?? '') === 'The works' ? 'works' : String(brief.what ?? '').split(',').filter((x) => x.trim()).length > 1 ? 'full' : 'standard'
  const date = typeof r.due_date === 'string' ? r.due_date : null
  const href = `/dashboard/requests/${r.id}`
  const plan: Line[] = [
    { key: 'book', label: r.status === 'awaiting_payment' ? 'The day is held. Pay to book it' : 'The day is booked', detail: `${TIER_LABEL[tier]}: ${TIER_SMALL[tier]}`, date: dayIso(new Date()), cost: typeof r.total_cents === 'number' ? r.total_cents : null, status: r.status === 'awaiting_payment' ? 'needs_payment' : 'with_team', ref: { kind: 'request', id: r.id, href } },
    { key: 'date', label: date ? 'Shoot day' : 'Pick the day', detail: date ? 'The photographer confirms the hour in your thread' : 'The team offers two dates in your thread', date, cost: null, status: 'later', ref: { kind: 'request', id: r.id, href } },
  ]
  const { data: row } = await admin.from('announcements').insert({ client_id: clientId, kind: 'shoot', status: 'in_progress', answers: { what: 'A shoot day', tier: TIER_LABEL[tier] }, picture: { tier, attached: [] }, places: { requestId: r.id }, timing: { date }, plan, total_cents: typeof r.total_cents === 'number' ? r.total_cents : 0, created_by: userId }).select('*').single()
  return row ? shapeShoot(row as Record<string, unknown>) : null
}
