import 'server-only'
/**
 * THE MONTHLY PLAN (owner 2026-09-19): a month of dated slots, each on a funnel stage.
 *
 * Built from a rhythm (posts a week, graphics a week, Reels a month, shoot days a month, a
 * creator a quarter) and the restaurant's own numbers. Planned rings start from Home's real
 * 30-day figures and add what the pieces are expected to add. A lever states a fact only when
 * the data has it. Start mints real work on the rails that exist; every piece is approved
 * before it is charged.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { computeStages } from '@/lib/insights/compute-stages'
import { listInfluencers, fitInfluencers } from '@/lib/influencers/read'
import { getVendorSchedule } from '@/lib/marketplace/creator-schedule'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { graphicOrderCents, createCreativeRequest } from '@/lib/requests/create'
import { getActiveRateCard } from '@/lib/design/price-sheet'
import { bookShoot, tierCents, tierFor } from '@/lib/shoot/day'
import { bookInfluencer } from '@/lib/influencers/book'
import { OCCASIONS } from '@/lib/design/occasions'

type Admin = ReturnType<typeof createAdminClient>
export type Stage = 'aware' | 'interest' | 'action' | 'order' | 'keep'
export type SlotKind = 'post' | 'graphic' | 'reel' | 'photos' | 'creator' | 'boost' | 'print' | 'offer' | 'review' | 'taste' | 'sign' | 'team'
export type Lean = 'seen' | 'asis' | 'in'
export interface Rhythm { posts_week: number; graphics_week: number; reels_month: number; shoots_month: number; creator_quarter: number }
export interface Slot { id?: string; date: string; stage: Stage; kind: SlotKind; label: string; options: Record<string, unknown>; cents: number; status: 'open' | 'planned' | 'minted' | 'done' | 'rolled' | 'removed'; ref?: { kind: string; id: string | null; href?: string } | null; why?: string | null }
export interface StagePlan { stage: Stage; label: string; now: number | null; planned: number | null; /** what the plan adds, an estimate */ add: number | null; /** the arithmetic behind the estimate, in words */ basis: string | null; unit: string; lever: string | null; levers: string[] }
export interface Month { month: string; status: string; /** the goal line, or the owner's own subject for the month ("Fall menu") once set */ thesis: string; subject: string | null; rhythm: Rhythm; lean: Lean; baseline: Record<Stage, number | null>; stages: StagePlan[]; slots: Slot[]; total: number; budgetCents: number | null; creator: { slug: string; name: string; nearby: number | null; fromCents: number | null; date: string | null } | null; facts: Facts }
interface Facts { usualReach: number | null; reelLift: number | null; postsN: number; reviews30: number | null; slowDay: string | null; budgetCents: number | null; locations: number; goal: string | null; prices: { graphic: number; video: number; shoot: number; print: number } }

export const STAGE_LABEL: Record<Stage, string> = { aware: 'Awareness', interest: 'Interest', action: 'Actions', order: 'Orders', keep: 'Reputation' }
export const KIND_STAGE: Record<SlotKind, Stage> = { post: 'aware', boost: 'aware', creator: 'aware', reel: 'interest', graphic: 'interest', photos: 'interest', offer: 'action', taste: 'action', sign: 'action', print: 'action', review: 'keep', team: 'keep' }
const REACH_PER_DOLLAR = 150
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => ymd(new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000))
const dow = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()
export const nextOf = (m: string): string => { const [y, mo] = m.split('-').map(Number); return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}` }
export const prevOf = (m: string): string => { const [y, mo] = m.split('-').map(Number); return `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}` }
export const nextMonth = (): string => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7) }
const monthDays = (month: string): string[] => { const [y, m] = month.split('-').map(Number); const out: string[] = []; for (let d = 1; d <= 31; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; const dt = new Date(iso + 'T12:00:00Z'); if (dt.getUTCMonth() !== m - 1 || dt.getUTCFullYear() !== y) break; out.push(iso) } return out }

/* ── the facts: what we actually know about this restaurant ── */
export async function loadFacts(admin: Admin, clientId: string): Promise<Facts> {
  const [posts, biz, shp, card, rev] = await Promise.all([
    admin.from('social_posts').select('reach, media_type, video_views, posted_at').eq('client_id', clientId).order('posted_at', { ascending: false }).limit(40),
    admin.from('businesses').select('monthly_budget, location_count, primary_goal').eq('client_id', clientId).maybeSingle(),
    admin.from('clients').select('shape_footprint').eq('id', clientId).maybeSingle(),
    getActiveRateCard().catch(() => null),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])
  const rows = ((posts.data ?? []) as { reach: number | null; media_type: string | null; video_views: number | null }[]).filter((r) => (r.reach ?? 0) > 0)
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
  const usual = med(rows.map((r) => r.reach as number))
  const vids = rows.filter((r) => String(r.media_type ?? '').toUpperCase() === 'VIDEO' || (r.video_views ?? 0) > 0).map((r) => r.reach as number)
  const pics = rows.filter((r) => !(String(r.media_type ?? '').toUpperCase() === 'VIDEO' || (r.video_views ?? 0) > 0)).map((r) => r.reach as number)
  const reelLift = vids.length >= 2 && pics.length >= 2 && med(pics)! > 0 ? Math.round((med(vids)! / med(pics)!) * 10) / 10 : null
  const graphic = card ? graphicOrderCents({ destinations: ['instagram-post', 'facebook-post'], tier: 2, photos: 'own' }, card.card) ?? 23100 : 23100
  const video = priceCreativeRequest('video', { what: 'x', filming: 'Use clips and photos I have', count: 'Just 1', when: 'No rush' })?.totalCents ?? 27500
  const shoot = tierCents('standard') ?? 38500
  const lc = String(biz.data?.location_count ?? '1'); const m = lc.match(/\d+/)
  return { usualReach: usual, reelLift, postsN: rows.length, reviews30: rev.count ?? null, slowDay: null, budgetCents: typeof biz.data?.monthly_budget === 'number' && biz.data.monthly_budget > 0 ? Math.round(Number(biz.data.monthly_budget) * 100) : null, locations: m ? Number(m[0]) : 1, goal: (biz.data?.primary_goal as string | null) ?? null, prices: { graphic, video, shoot, print: 2500 } }
}

/* ── Home's real 30-day numbers, the baseline every planned ring starts from ── */
export async function loadBaseline(clientId: string): Promise<Record<Stage, number | null>> {
  const out: Record<Stage, number | null> = { aware: null, interest: null, action: null, order: null, keep: null }
  try {
    const stages = await computeStages(clientId, '30d')
    const map: Record<string, Stage> = { '1': 'aware', '2': 'interest', '3': 'action', '4': 'order', '5': 'keep' }
    for (const s of stages) { const k = map[String(s.stage)]; if (k && s.headline != null) out[k] = s.headline }
  } catch { /* no Google yet: rings start from nothing, honestly */ }
  return out
}

/** the owner's own rhythm, when they have set one (migration 271); the budget's default otherwise */
export async function loadRhythm(admin: Admin, clientId: string, f: Facts): Promise<{ rhythm: Rhythm; set: boolean }> {
  const { data, error } = await admin.from('plan_rhythm').select('posts_week, graphics_week, reels_month, shoots_month, creator_quarter').eq('client_id', clientId).maybeSingle()
  if (error || !data) return { rhythm: defaultRhythm(f), set: false }
  return { rhythm: { posts_week: Number(data.posts_week), graphics_week: Number(data.graphics_week), reels_month: Number(data.reels_month), shoots_month: Number(data.shoots_month), creator_quarter: Number(data.creator_quarter) }, set: true }
}
export async function saveRhythm(admin: Admin, clientId: string, r: Partial<Rhythm>, f: Facts): Promise<{ ok: boolean; error?: string }> {
  const cur = (await loadRhythm(admin, clientId, f)).rhythm
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d }
  const row = { client_id: clientId, posts_week: clamp(r.posts_week, 0, 7, cur.posts_week), graphics_week: clamp(r.graphics_week, 0, 3, cur.graphics_week), reels_month: clamp(r.reels_month, 0, 8, cur.reels_month), shoots_month: clamp(r.shoots_month, 0, 2, cur.shoots_month), creator_quarter: clamp(r.creator_quarter, 0, 3, cur.creator_quarter), updated_at: new Date().toISOString() }
  const { error } = await admin.from('plan_rhythm').upsert(row, { onConflict: 'client_id' })
  return error ? { ok: false, error: /plan_rhythm/.test(error.message) ? 'The rhythm is not switched on yet. The team has to run one update first.' : error.message } : { ok: true }
}
export function defaultRhythm(f: Facts): Rhythm {
  const b = f.budgetCents ?? 0
  return { posts_week: b >= 100000 ? 6 : b >= 40000 ? 4 : 3, graphics_week: b >= 40000 ? 1 : 0, reels_month: f.reelLift && f.reelLift >= 1.5 ? 2 : b >= 100000 ? 2 : b >= 40000 ? 1 : 0, shoots_month: b >= 40000 ? 1 : 0, creator_quarter: b >= 80000 ? 1 : 0 }
}

/* ── build the month: slots on dates, planned numbers per stage, levers ── */
/* ── the occasions in a month, and the work each one needs, walked back from its date ──
   A graphic lands ten days before, print two weeks before when the holiday sells ahead
   (catering, pre-orders, a ticketed night), a boost three days before, a post on the day.
   The month BEFORE a menu holiday puts the holiday menu on its shoot list. */
export interface OccasionHit { id: string; name: string; emoji: string; date: string; sellsAhead: boolean; menu: boolean }
const SELLS_AHEAD = new Set(['thanksgiving', 'christmas', 'nye', 'valentines', 'mothersday'])
const MENU_HOLIDAY = new Set(['thanksgiving', 'christmas', 'nye', 'valentines'])
export function occasionsIn(month: string): OccasionHit[] {
  const from = new Date(`${month}-01T12:00:00`); from.setMonth(from.getMonth() - 1)
  return OCCASIONS.map((o) => { const d = o.nextOn(from); return { id: o.id, name: o.name, emoji: o.emoji, date: ymd(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))), sellsAhead: SELLS_AHEAD.has(o.id), menu: MENU_HOLIDAY.has(o.id) } }).filter((o) => o.date.startsWith(month))
}
export function occasionSlots(month: string, f: Facts, lean: Lean): Slot[] {
  const out: Slot[] = []
  for (const o of occasionsIn(month)) {
    const inMonth = (d: string) => (d.startsWith(month) ? d : `${month}-01`)
    out.push({ date: inMonth(addDays(o.date, -10)), stage: 'interest', kind: 'graphic', label: `${o.name} graphic`, options: { where: ['post', 'story'], priceOn: false, brandKit: true, occasion: o.id, emoji: o.emoji }, cents: f.prices.graphic, status: 'planned', why: `${o.emoji} ${o.name} is ${niceShort(o.date)}` })
    if (o.sellsAhead && (lean === 'in' || (f.budgetCents ?? 0) >= 100000)) out.push({ date: inMonth(addDays(o.date, -14)), stage: 'action', kind: 'print', label: `${o.name} table tent`, options: { kinds: ['tent'], occasion: o.id, emoji: o.emoji }, cents: f.prices.print, status: 'planned', why: 'Sells ahead: pre-orders and catering' })
    if ((f.budgetCents ?? 0) >= 40000) out.push({ date: inMonth(addDays(o.date, -3)), stage: 'aware', kind: 'boost', label: `${o.name} boost`, options: { cents: 4000, days: 3, occasion: o.id, emoji: o.emoji }, cents: 4000, status: 'planned', why: `The three days before ${o.name}` })
    out.push({ date: o.date, stage: 'aware', kind: 'post', label: `${o.name} post`, options: { story: true, occasion: o.id, emoji: o.emoji }, cents: 0, status: 'planned' })
  }
  return out
}
const niceShort = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}` }

export function buildSlots(month: string, r: Rhythm, f: Facts, creator: Month['creator'], lean: Lean): Slot[] {
  const days = monthDays(month)
  const slots: Slot[] = []
  const thursdays = days.filter((d) => dow(d) === 4), saturdays = days.filter((d) => dow(d) === 6), tuesdays = days.filter((d) => dow(d) === 2)
  /* the shoot day: first Thursday; everything made that month comes from it */
  const shootDay = r.shoots_month > 0 ? thursdays[0] ?? days[3] : null
  const nextMenuHoliday = occasionsIn(nextOf(month)).find((o) => o.menu)
  if (shootDay) slots.push({ date: shootDay, stage: 'interest', kind: 'photos', label: 'Shoot day', options: { list: [...(nextMenuHoliday ? [`the ${nextMenuHoliday.name} menu`] : []), 'the specials', 'the room', 'drinks'] }, cents: tierCents(tierFor(3)) ?? f.prices.shoot, status: 'planned', why: 'One day feeds the month' })
  /* posts: spread over the week, from the shoot */
  const postDays = [1, 3, 5, 6, 0, 2].slice(0, Math.max(0, Math.min(7, r.posts_week)))
  for (const d of days) if (postDays.includes(dow(d))) slots.push({ date: d, stage: 'aware', kind: 'post', label: 'Post', options: { story: dow(d) === 5 }, cents: 0, status: 'planned' })
  /* graphics: Thursdays, the price or the hours on it */
  const graphicDays = thursdays.filter((d) => d !== shootDay)
  for (const [i, d] of graphicDays.entries()) if (i < Math.round(r.graphics_week * graphicDays.length)) slots.push({ date: d, stage: 'interest', kind: 'graphic', label: 'Graphic', options: { where: ['post'], priceOn: true, brandKit: true, from: shootDay ? 'shoot' : 'ours' }, cents: f.prices.graphic, status: 'planned', why: 'The price where people remember it' })
  /* reels: Sundays after the shoot */
  const reelDays = days.filter((d) => dow(d) === 0 && (!shootDay || d > shootDay))
  for (let i = 0; i < r.reels_month; i++) { const d = reelDays[i * 2] ?? reelDays[i]; if (d) slots.push({ date: d, stage: 'interest', kind: 'reel', label: 'Reel', options: { filmed: shootDay ? 'shoot' : 'clips', style: 'dish', captions: true }, cents: f.prices.video, status: 'planned', why: f.reelLift ? `Your Reels do ${f.reelLift}× your photos` : 'Reels reach further than photos' }) }
  /* the creator: a Saturday in week two, or a Tuesday when leaning in */
  /* a creator "a quarter": the first month of each quarter gets one; 2 a quarter, the first two; 3, every month */
  const inQuarter = ((Number(month.slice(5)) - 1) % 3) < r.creator_quarter
  if (inQuarter && creator) { let d = lean === 'in' ? tuesdays[1] ?? saturdays[1] : creator.date && creator.date.startsWith(month) ? creator.date : saturdays[1] ?? saturdays[0]; if (d && d === shootDay) d = saturdays.find((x) => x > d!) ?? tuesdays.find((x) => x > d!) ?? d; if (d) slots.push({ date: d, stage: 'aware', kind: 'creator', label: `${creator.name.split(' ')[0]} visits`, options: { slug: creator.slug, code: true, repost: true }, cents: creator.fromCents ?? 0, status: 'planned', why: creator.nearby ? `${creator.nearby.toLocaleString()} people nearby watch ${creator.name.split(' ')[0]}` : null }) }
  /* boost: the first post after the shoot, sized by lean */
  const boostCents = lean === 'seen' ? 10000 : lean === 'in' ? 4000 : 6000
  const firstPost = slots.filter((s) => s.kind === 'post' && (!shootDay || s.date > shootDay)).map((s) => s.date).sort()[0]
  if (firstPost && (f.budgetCents ?? 0) >= 40000) slots.push({ date: firstPost, stage: 'aware', kind: 'boost', label: 'Boost', options: { cents: boostCents, days: 3 }, cents: boostCents, status: 'planned', why: `$${boostCents / 100} reaches about ${((boostCents / 100) * REACH_PER_DOLLAR).toLocaleString()} nearby` })
  /* actions: a Tuesday deal when leaning in, a code with the creator, the free things */
  if (lean === 'in' && tuesdays[0]) slots.push({ date: tuesdays[0], stage: 'action', kind: 'offer', label: 'Tuesday deal', options: { text: 'Tuesdays in October', code: true, weekly: true }, cents: 0, status: 'planned', why: 'A reason to come on the slow night' })
  if (lean === 'in' && f.prices.print) slots.push({ date: thursdays[1] ?? days[10], stage: 'action', kind: 'print', label: 'Table tent', options: { kinds: ['tent'] }, cents: f.prices.print, status: 'planned' })
  slots.push({ date: days[0], stage: 'action', kind: 'taste', label: 'A taste at the counter', options: { days: 7 }, cents: 0, status: 'planned' })
  slots.push({ date: days[0], stage: 'keep', kind: 'review', label: 'Ask for a review', options: { days: 14 }, cents: 0, status: 'planned', why: f.reviews30 != null ? `${f.reviews30} reviews last month` : null })
  slots.push({ date: days[0], stage: 'keep', kind: 'team', label: 'Team card', options: {}, cents: 0, status: 'planned' })
  if (lean === 'seen') { const b = slots.find((s) => s.kind === 'boost'); if (b) { b.options.cents = 10000; b.cents = 10000 } }
  /* the occasions: their pieces join, and the rhythm post on the day gives way to the occasion's post */
  const occ = occasionSlots(month, f, lean)
  const occDays = new Set(occ.filter((s) => s.kind === 'post').map((s) => s.date))
  const merged = [...slots.filter((s) => !(s.kind === 'post' && occDays.has(s.date))), ...occ]
  return merged.sort((a, b) => a.date.localeCompare(b.date))
}

export function planStages(slots: Slot[], base: Record<Stage, number | null>, f: Facts, creator: Month['creator']): StagePlan[] {
  const on = slots.filter((s) => s.status !== 'removed' && s.status !== 'rolled')
  const n = (k: SlotKind) => on.filter((s) => s.kind === k).length
  const usual = f.usualReach ?? 0
  const boost = on.filter((s) => s.kind === 'boost').reduce((a, s) => a + (Number(s.options.cents) || 0), 0)
  const reelLift = f.reelLift ?? 1.8
  const awareAdd = n('post') * usual + n('reel') * usual * (reelLift - 1) + Math.round(boost / 100) * REACH_PER_DOLLAR + (n('creator') && creator?.nearby ? creator.nearby : 0)
  const interestAdd = n('reel') * 40 + n('graphic') * 15 + n('photos') * 10
  const actionAdd = n('offer') * 25 + n('creator') * 20 + n('print') * 8 + n('taste') * 10
  const keepAdd = n('review') * 6
  const levers = {
    aware: [n('reel') ? `Reels${f.reelLift ? ` ×${f.reelLift}` : ''}` : '', n('creator') && creator ? creator.name.split(' ')[0] : '', boost ? `Boost $${boost / 100}` : ''].filter(Boolean),
    interest: [n('photos') ? 'the shoot' : '', n('graphic') ? 'graphic, price on it' : ''].filter(Boolean).slice(0, n('photos') ? 1 : 2),
    action: [n('offer') ? 'Tuesday deal' : '', n('creator') && creator ? `${creator.name.split(' ')[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8)}10` : '', n('taste') ? 'a taste' : ''].filter(Boolean),
    order: [] as string[],
    keep: [n('review') ? 'ask for a review' : ''].filter(Boolean),
  }
  const basis: Record<Stage, string | null> = {
    aware: [n('post') ? `${n('post')} posts × your usual ${usual.toLocaleString()}` : '', n('reel') ? `${n('reel')} Reel${n('reel') > 1 ? 's' : ''} at ${reelLift}× a photo` : '', boost ? `$${boost / 100} boost ≈ ${(Math.round(boost / 100) * REACH_PER_DOLLAR).toLocaleString()}` : '', n('creator') && creator?.nearby ? `${creator.name.split(' ')[0]} ≈ ${creator.nearby.toLocaleString()} nearby` : ''].filter(Boolean).join(' + ') || null,
    interest: [n('reel') ? `about 40 a Reel` : '', n('graphic') ? `15 a graphic` : '', n('photos') ? `10 from the shoot` : ''].filter(Boolean).join(' + ') || null,
    action: [n('offer') ? 'about 25 from the deal' : '', n('creator') ? '20 from the code' : '', n('print') ? '8 from the table tent' : '', n('taste') ? '10 from the taste' : ''].filter(Boolean).join(' + ') || null,
    order: 'about 15 in 100 actions become a visit',
    keep: n('review') ? 'about 6 when you ask' : null,
  }
  const mk = (stage: Stage, add: number, unit: string): StagePlan => ({ stage, label: STAGE_LABEL[stage], now: base[stage], planned: base[stage] != null ? Math.round(base[stage]! + add) : add > 0 ? Math.round(add) : null, add: add > 0 ? Math.round(add) : null, basis: add > 0 ? basis[stage] : null, unit, lever: levers[stage][0] ? levers[stage].join(' · ') : null, levers: levers[stage] })
  const action = mk('action', actionAdd, 'actions')
  const orderAdd = action.add != null ? Math.round(action.add * 0.15) : null
  return [mk('aware', awareAdd, 'people'), mk('interest', interestAdd, 'follows & saves'), action, { stage: 'order', label: STAGE_LABEL.order, now: base.order, planned: base.order != null && orderAdd != null ? base.order + orderAdd : orderAdd, add: orderAdd, basis: orderAdd ? basis.order : null, unit: base.order != null ? 'orders' : 'visits', lever: null, levers: [] }, mk('keep', keepAdd, 'reviews')]
}

export async function topCreator(admin: Admin, clientId: string, month: string): Promise<Month['creator']> {
  try {
    const [biz] = await Promise.all([admin.from('businesses').select('city, state, cuisine').eq('client_id', clientId).maybeSingle()])
    const state = ((biz.data?.state as string | null) ?? 'WA').toUpperCase().slice(0, 2)
    const cards = await listInfluencers(admin, state)
    const fit = fitInfluencers(cards, { cuisine: (biz.data?.cuisine as string | null) ?? null, city: (biz.data?.city as string | null) ?? null, state })
    const top = fit[0] ? cards.find((c) => c.slug === fit[0].slug) : null
    if (!top) return null
    const a = top.audience
    const sched = await getVendorSchedule(top.id, new Date().toISOString(), 60).catch(() => null)
    const inMonth = sched?.slots.find((s) => s.date.startsWith(month))?.date ?? null
    return { slug: top.slug, name: top.name, nearby: a?.avgViews && a?.localPct != null ? Math.round(a.avgViews * a.localPct / 100) : null, fromCents: top.fromCents, date: inMonth }
  } catch { return null }
}

export interface Pre { facts: Facts; base: Record<Stage, number | null>; rhythm: Rhythm }
export async function preload(admin: Admin, clientId: string): Promise<Pre> {
  const [facts, base] = await Promise.all([loadFacts(admin, clientId), loadBaseline(clientId)])
  const { rhythm } = await loadRhythm(admin, clientId, facts)
  return { facts, base, rhythm }
}
export async function draftMonth(admin: Admin, clientId: string, month: string, lean: Lean = 'asis', rhythm?: Rhythm, subject?: string | null, pre?: Pre): Promise<Month> {
  const p = pre ?? await preload(admin, clientId)
  const creator = await topCreator(admin, clientId, month)
  const facts = p.facts, base = p.base
  const r = rhythm ?? p.rhythm
  let slots = buildSlots(month, r, facts, creator, lean)
  /* the law from the picker: paid pieces only inside the budget. Trim the priciest optional piece first. */
  if (facts.budgetCents) {
    const order: SlotKind[] = ['graphic', 'reel', 'print', 'boost']
    let total = slots.reduce((a, x) => a + x.cents, 0)
    while (total > facts.budgetCents) {
      const k = order.find((kind) => slots.filter((x) => x.kind === kind).length > (kind === 'graphic' || kind === 'reel' ? 1 : 0))
      if (!k) break
      const idx = slots.map((x, i) => [x, i] as const).filter(([x]) => x.kind === k).pop()![1]
      slots = slots.filter((_, i) => i !== idx); total = slots.reduce((a, x) => a + x.cents, 0)
    }
  }
  const stages = planStages(slots, base, facts, creator)
  const total = slots.reduce((s, x) => s + x.cents, 0)
  const sub = (subject ?? '').trim().slice(0, 80) || null
  const thesis = sub ?? [facts.goal ? facts.goal.replace(/^get /i, 'Get ') : 'More people in', lean === 'in' ? 'Fill the slow nights.' : ''].filter(Boolean).join(' ')
  return { month, status: 'draft', thesis, subject: sub, rhythm: r, lean, baseline: base, stages, slots, total, budgetCents: facts.budgetCents, creator, facts }
}

/* ── edits: the owner drops a piece, adds one, or leans ── */
export interface Edits { lean?: Lean; subject?: string | null; rhythm?: Partial<Rhythm>; drop?: string[]; add?: { kind: SlotKind; date?: string }[] }
export const slotKey = (s: Slot) => `${s.kind}:${s.date}`
export interface AddTile { kind: SlotKind; stage: Stage; label: string; cents: number; date: string; why: string | null }
/** what each ring can take on, with its real price */
export function addTiles(m: Month): AddTile[] {
  const f = m.facts; const days = monthDays(m.month)
  const has = (k: SlotKind) => m.slots.some((s) => s.kind === k && s.status !== 'removed')
  const tue = days.find((d) => dow(d) === 2) ?? days[1]; const mon = days.find((d) => dow(d) === 1) ?? days[0]; const sat = days.filter((d) => dow(d) === 6)[1] ?? days[12]; const thu = days.filter((d) => dow(d) === 4)[1] ?? days[10]; const sun = days.filter((d) => dow(d) === 0)[2] ?? days[20]
  const out: AddTile[] = [
    { kind: 'boost', stage: 'aware', label: 'Boost a post', cents: 4000, date: mon, why: `$40 reaches about ${(40 * REACH_PER_DOLLAR).toLocaleString()} nearby` },
    ...(m.creator && !has('creator') ? [{ kind: 'creator' as SlotKind, stage: 'aware' as Stage, label: `${m.creator.name.split(' ')[0]} visits`, cents: m.creator.fromCents ?? 0, date: m.creator.date ?? sat, why: m.creator.nearby ? `${m.creator.nearby.toLocaleString()} people nearby watch` : null }] : []),
    { kind: 'reel', stage: 'interest', label: 'Another Reel', cents: f.prices.video, date: sun, why: f.reelLift ? `Your Reels do ${f.reelLift}× your photos` : null },
    { kind: 'graphic', stage: 'interest', label: 'A graphic', cents: f.prices.graphic, date: thu, why: null },
    ...(!has('photos') ? [{ kind: 'photos' as SlotKind, stage: 'interest' as Stage, label: 'Shoot day', cents: f.prices.shoot, date: days.filter((d) => dow(d) === 4)[0] ?? days[3], why: 'One day feeds the month' }] : []),
    ...(!has('offer') ? [{ kind: 'offer' as SlotKind, stage: 'action' as Stage, label: 'Tuesday deal', cents: 0, date: tue, why: 'A reason to come on the slow night' }] : []),
    ...(!has('print') ? [{ kind: 'print' as SlotKind, stage: 'action' as Stage, label: 'Table tent', cents: f.prices.print, date: thu, why: null }] : []),
    ...(!has('taste') ? [{ kind: 'taste' as SlotKind, stage: 'action' as Stage, label: 'A taste', cents: 0, date: days[0], why: null }] : []),
    ...(!has('review') ? [{ kind: 'review' as SlotKind, stage: 'keep' as Stage, label: 'Ask for a review', cents: 0, date: days[0], why: null }] : []),
    ...(!has('team') ? [{ kind: 'team' as SlotKind, stage: 'keep' as Stage, label: 'Team card', cents: 0, date: days[0], why: null }] : []),
  ]
  return out
}
export function applyEdits(m: Month, e: Edits): Month {
  const drop = new Set(e.drop ?? [])
  let slots = m.slots.filter((s) => !drop.has(slotKey(s)))
  const tiles = addTiles({ ...m, slots })
  for (const a of e.add ?? []) {
    const t = tiles.find((x) => x.kind === a.kind) ?? tiles.find((x) => x.kind === a.kind)
    const date = a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : t?.date ?? `${m.month}-15`
    const base: Slot = { date, stage: KIND_STAGE[a.kind], kind: a.kind, label: t?.label ?? a.kind, options: a.kind === 'boost' ? { cents: 4000, days: 3 } : a.kind === 'creator' && m.creator ? { slug: m.creator.slug, code: true, repost: true } : a.kind === 'reel' ? { filmed: slots.some((s) => s.kind === 'photos') ? 'shoot' : 'clips', style: 'dish', captions: true } : a.kind === 'graphic' ? { where: ['post'], priceOn: true, from: slots.some((s) => s.kind === 'photos') ? 'shoot' : 'ours' } : a.kind === 'photos' ? { list: ['the specials', 'the room', 'drinks'] } : a.kind === 'print' ? { kinds: ['tent'] } : a.kind === 'offer' ? { text: 'Tuesdays', code: true, weekly: true } : {}, cents: t?.cents ?? 0, status: 'planned', why: t?.why ?? null }
    if (a.kind === 'creator' && !m.creator) continue
    slots = [...slots, base].sort((x, y) => x.date.localeCompare(y.date))
  }
  const stages = planStages(slots, m.baseline, m.facts, m.creator)
  return { ...m, lean: e.lean ?? m.lean, slots, stages, total: slots.reduce((a, s) => a + s.cents, 0) }
}
/** what the month actually did: Home's numbers for that month, once it has run */
export async function loadActual(clientId: string, month: string): Promise<Record<Stage, number | null> | null> {
  const days = monthDays(month); const end = days[days.length - 1]; const today = ymd(new Date())
  if (days[0] > today) return null
  /* the month so far while it runs, the whole month once it has */
  const upTo = end > today ? today : end
  const elapsed = days.filter((d) => d <= upTo).length
  try {
    const stages = await computeStages(clientId, '30d', 0, upTo, elapsed)
    const out: Record<Stage, number | null> = { aware: null, interest: null, action: null, order: null, keep: null }
    const map: Record<string, Stage> = { '1': 'aware', '2': 'interest', '3': 'action', '4': 'order', '5': 'keep' }
    for (const s of stages) { const k = map[String(s.stage)]; if (k && s.headline != null) out[k] = s.headline }
    return out
  } catch { return null }
}

/* ── persistence ── */
export async function saveMonth(admin: Admin, clientId: string, userId: string, m: Month, status: 'draft' | 'started' = 'draft'): Promise<string | null> {
  const rowIn = { client_id: clientId, month: m.month, status, thesis: m.thesis, subject: m.subject, rhythm: m.rhythm, lean: m.lean, baseline: m.baseline, planned: Object.fromEntries(m.stages.map((s) => [s.stage, { planned: s.planned, lever: s.lever, levers: s.levers }])), total_cents: m.total, ...(status === 'started' ? { started_at: new Date().toISOString() } : {}), created_by: userId, updated_at: new Date().toISOString() }
  let { data: row, error } = await admin.from('plan_months').upsert(rowIn, { onConflict: 'client_id,month' }).select('id').single()
  /* until 270 is run there is no subject column; the subject still lives in thesis */
  if (error && /subject/i.test(error.message)) { const { subject: _s, ...rest } = rowIn; void _s; ({ data: row, error } = await admin.from('plan_months').upsert(rest, { onConflict: 'client_id,month' }).select('id').single()) }
  if (error || !row) return null
  const id = String(row.id)
  await admin.from('plan_slots').delete().eq('plan_month_id', id).in('status', ['planned', 'open'])
  if (m.slots.length) await admin.from('plan_slots').insert(m.slots.filter((s) => !s.id || s.status === 'planned').map((s) => ({ plan_month_id: id, client_id: clientId, date: s.date, stage: s.stage, kind: s.kind, label: s.label, options: s.options, cents: s.cents, status: s.status, ref: s.ref ?? null, why: s.why ?? null })))
  return id
}
export async function loadMonth(admin: Admin, clientId: string, month: string): Promise<Month | null> {
  const { data: row } = await admin.from('plan_months').select('*').eq('client_id', clientId).eq('month', month).maybeSingle()
  if (!row) return null
  const { data: slots } = await admin.from('plan_slots').select('*').eq('plan_month_id', row.id).neq('status', 'removed').order('date')
  const [facts, creator] = await Promise.all([loadFacts(admin, clientId), topCreator(admin, clientId, month)])
  const sl: Slot[] = ((slots ?? []) as Record<string, unknown>[]).map((s) => ({ id: String(s.id), date: String(s.date), stage: s.stage as Stage, kind: s.kind as SlotKind, label: String(s.label ?? ''), options: (s.options ?? {}) as Record<string, unknown>, cents: Number(s.cents) || 0, status: s.status as Slot['status'], ref: (s.ref as Slot['ref']) ?? null, why: (s.why as string | null) ?? null }))
  const base = (row.baseline ?? { aware: null, interest: null, action: null, order: null, keep: null }) as Record<Stage, number | null>
  return { month, status: String(row.status), thesis: String(row.thesis ?? ''), subject: row.subject ? String(row.subject) : null, rhythm: row.rhythm as Rhythm, lean: row.lean as Lean, baseline: base, stages: planStages(sl, base, facts, creator), slots: sl, total: sl.filter((s) => s.status !== 'rolled').reduce((a, s) => a + s.cents, 0), budgetCents: facts.budgetCents, creator, facts }
}

/* ── Start: the month becomes real work ── */
export async function startMonth(admin: Admin, clientId: string, userId: string, m: Month): Promise<{ id: string | null; minted: number; errors: string[] }> {
  const errors: string[] = []
  let minted = 0
  const shoot = m.slots.find((s) => s.kind === 'photos' && s.status === 'planned')
  if (shoot) {
    const r = await bookShoot(admin, { clientId, userId, items: ((shoot.options.list as string[]) ?? []).map((label) => ({ label })), date: shoot.date, note: `${m.month} shoot day from the monthly plan` })
    if (r.ok) { shoot.status = 'minted'; shoot.ref = { kind: 'request', id: r.shoot.requestId, href: r.shoot.href ?? undefined }; minted++ } else errors.push(`The shoot day did not book: ${r.error}`)
  }
  const cr = m.slots.find((s) => s.kind === 'creator' && s.status === 'planned')
  if (cr && typeof cr.options.slug === 'string') {
    const { data: cl } = await admin.from('clients').select('name').eq('id', clientId).maybeSingle()
    const r = await bookInfluencer(admin, { clientId, userId, slug: cr.options.slug, listingSlug: '', tierName: null, date: cr.date, start: null, brief: { try: 'What is new this month, and the specials', know: m.thesis, party: 2, tag: true, repost: true, whitelist: false, code: true }, restaurant: { name: (cl?.name as string) ?? 'Your restaurant' } })
    if (r.ok) { cr.status = 'minted'; cr.ref = { kind: 'booking', id: r.bookingId, href: '/dashboard/bookings' }; minted++ } else errors.push(`The creator ask did not send: ${r.error}`)
  }
  /* the posts: one monthly order to the desk, from the shoot */
  const postsN = m.slots.filter((s) => s.kind === 'post').length
  if (postsN) {
    const r = await createCreativeRequest({ clientId, userId, type: 'social', order: true, due_date: m.slots.find((s) => s.kind === 'post')?.date ?? null, answers: { platforms: 'Instagram, Facebook', count: postsN >= 12 ? '12 or more' : postsN >= 8 ? '8 a month' : '4 a month', about: m.thesis, when: 'This month', notes: `${postsN} posts for ${m.month}, on the dates in the plan. Written from the shoot day.` } })
    if (r.ok) { for (const s of m.slots) if (s.kind === 'post') { s.status = 'minted'; s.ref = { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } } minted++ } else errors.push(`The posts did not order: ${r.error}`)
  }
  const id = await saveMonth(admin, clientId, userId, m, 'started')
  return { id, minted, errors }
}

/* ── the cron: graphics, Reels and print become requests a week before their date ── */
export async function mintDueSlots(admin: Admin): Promise<{ minted: number; errors: string[] }> {
  const errors: string[] = []
  let minted = 0
  const until = addDays(ymd(new Date()), 7)
  const { data: rows } = await admin.from('plan_slots').select('id, client_id, plan_month_id, date, kind, label, options, cents').eq('status', 'planned').in('kind', ['graphic', 'reel', 'print']).lte('date', until).limit(200)
  for (const s of (rows ?? []) as Record<string, unknown>[]) {
    const { data: pm } = await admin.from('plan_months').select('status, thesis, created_by').eq('id', s.plan_month_id).maybeSingle()
    if (!pm || pm.status !== 'started' || !pm.created_by) continue
    const o = (s.options ?? {}) as Record<string, unknown>
    const kind = String(s.kind); const clientId = String(s.client_id); const userId = String(pm.created_by)
    const r = kind === 'graphic'
      ? await createCreativeRequest({ clientId, userId, type: 'graphic', order: true, due_date: String(s.date), answers: { what: `This week's graphic, ${String(s.date)}`, where: 'Instagram post, Facebook post', words: String(pm.thesis ?? ''), when: 'This week', notes: `From the monthly plan. ${o.from === 'shoot' ? 'Photos from the shoot day.' : ''}` }, design: { destinations: ['instagram-post', 'facebook-post'], tier: 2, photos: o.from === 'shoot' ? 'shoot' : 'none', dueDateISO: String(s.date) } })
      : kind === 'reel'
      ? await createCreativeRequest({ clientId, userId, type: 'video', order: true, due_date: String(s.date), answers: { what: `A Reel for ${String(s.date)}`, filming: 'Use clips and photos I have', count: 'Just 1', featuring: String(pm.thesis ?? ''), when: 'This week', notes: `From the monthly plan. ${o.filmed === 'shoot' ? 'Clips from the shoot day.' : ''} Style: ${String(o.style ?? 'dish')}.` } })
      : await createCreativeRequest({ clientId, userId, type: 'print', due_date: String(s.date), answers: { what: `${String(s.label ?? 'Table tent')}`, printing: 'Not sure', when: 'This week', notes: 'From the monthly plan, from this week\'s graphic.' } })
    if (r.ok) { await admin.from('plan_slots').update({ status: 'minted', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` }, updated_at: new Date().toISOString() }).eq('id', s.id); minted++ }
    else errors.push(`${kind} ${String(s.date)}: ${r.error}`)
  }
  return { minted, errors }
}

/* ── Home's read (owner 2026-09-22, "incorporate it with the home dashboard"): the month that is
   running, or the one that just ran, without drafting anything. Home draws its pieces as beads
   on the rings, the planned ring dashed behind the real one, and one line of what happened. ── */
export interface HomeBead { stage: Stage; kind: SlotKind; status: string; label: string; date: string; href: string | null }
export interface HomePlan { month: string; status: 'started' | 'done'; planned: Record<Stage, number | null>; beads: HomeBead[]; counts: { done: number; minted: number; planned: number }; elapsed: number; days: number; recap: string | null; total: number }
export async function loadHomePlan(admin: Admin, clientId: string): Promise<HomePlan | null> {
  const thisMonth = ymd(new Date()).slice(0, 7)
  const { data: rows, error } = await admin.from('plan_months').select('id, month, status, planned, total_cents').eq('client_id', clientId).in('month', [prevOf(thisMonth), thisMonth, nextOf(thisMonth)]).in('status', ['started', 'done'])
  if (error || !rows?.length) return null
  /* the running month wins; otherwise the month that just finished, for its recap */
  const pick = (rows as { id: string; month: string; status: string; planned: Record<string, { planned: number | null }>; total_cents: number }[])
    .sort((a, b) => a.month.localeCompare(b.month))
    .find((r) => r.status === 'started' && r.month >= thisMonth) ?? (rows as { id: string; month: string; status: string; planned: Record<string, { planned: number | null }>; total_cents: number }[]).find((r) => r.status === 'started') ?? (rows as { id: string; month: string; status: string; planned: Record<string, { planned: number | null }>; total_cents: number }[]).find((r) => r.status === 'done' && r.month === prevOf(thisMonth))
  if (!pick) return null
  const { data: slots } = await admin.from('plan_slots').select('stage, kind, status, label, date, ref').eq('plan_month_id', pick.id).neq('status', 'removed').order('date')
  const sl = ((slots ?? []) as { stage: Stage; kind: SlotKind; status: string; label: string | null; date: string; ref: { href?: string } | null }[])
  /* one bead per kind per ring: the nearest coming piece, or the last done one */
  const beads: HomeBead[] = []
  for (const st of ['aware', 'interest', 'action', 'order', 'keep'] as Stage[]) {
    const kinds = [...new Set(sl.filter((x) => x.stage === st).map((x) => x.kind))]
    for (const k of kinds.slice(0, 4)) { const mine = sl.filter((x) => x.stage === st && x.kind === k); const b = mine.find((x) => x.status === 'planned' || x.status === 'minted') ?? mine[mine.length - 1]; beads.push({ stage: st, kind: k, status: b.status, label: b.label ?? k, date: b.date, href: b.ref?.href ?? null }) }
  }
  const planned = Object.fromEntries((['aware', 'interest', 'action', 'order', 'keep'] as Stage[]).map((st) => [st, pick.planned?.[st]?.planned ?? null])) as Record<Stage, number | null>
  const days = monthDays(pick.month); const today = ymd(new Date())
  const elapsed = days.filter((d) => d <= today).length
  let recap: string | null = null
  if (pick.status === 'done') {
    const actual = await loadActual(clientId, pick.month)
    if (actual) {
      const best = (Object.keys(planned) as Stage[]).map((st) => ({ st, d: actual[st] != null && planned[st] ? (actual[st]! - planned[st]!) / planned[st]! : null })).filter((x) => x.d != null).sort((a, b) => Math.abs(b.d!) - Math.abs(a.d!))[0]
      if (best) recap = `${STAGE_LABEL[best.st]} ${best.d! >= 0 ? 'beat' : 'missed'} the ${MONTH_WORD(pick.month)} plan by ${Math.round(Math.abs(best.d!) * 100)}%.`
    }
  }
  return { month: pick.month, status: pick.status as 'started' | 'done', planned, beads, counts: { done: sl.filter((x) => x.status === 'done').length, minted: sl.filter((x) => x.status === 'minted').length, planned: sl.filter((x) => x.status === 'planned').length }, elapsed, days: days.length, recap, total: Number(pick.total_cents) || 0 }
}
const MONTH_WORD = (m: string) => new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
