import 'server-only'
/**
 * The influencer marketplace, read side (owner 2026-09-17).
 *
 * A creator is a vendor with a food_influencer offer. What makes them an influencer here is the
 * audience row: who watches them, where those people live, what a post does. Everything a
 * restaurant sees comes from real rows: vendors, vendor_listings, creator_audience, creator_posts,
 * work_ratings, availability_rules. Nothing is typed on the page. Missing pieces render as
 * honest empties ("reach not connected yet"), never as a made-up number.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { rowToPackage, type ListingRow, type CreatorPackage } from '@/lib/marketplace/package'
import { getVendorSchedule } from '@/lib/marketplace/creator-schedule'

type Admin = ReturnType<typeof createAdminClient>

export interface Platform { platform: string; handle: string; followers?: number | null; avg_views?: number | null; engagement?: number | null; url?: string | null; verified_at?: string | null }
export interface Audience { city: string | null; platforms: Platform[]; followers: number | null; avgViews: number | null; engagement: number | null; localPct: number | null; ages: string | null; cuisines: string[]; styles: string[]; languages: string[]; responseHours: number | null; postsWithinDays: number; partySize: number; mealCapCents: number; repostOk: boolean; whitelistCents: number | null; verifiedAt: string | null }
export interface CreatorPost { id: string; kind: 'sample' | 'collab'; platform: string; url: string | null; thumb: string | null; caption: string | null; views: number | null; likes: number | null; saves: number | null; comments: number | null; linkTaps: number | null; postedAt: string | null; restaurant: string | null; listing: string | null; note: string | null }
export interface Review { stars: number; comment: string | null; when: string; restaurant: string | null }
export interface Offer { slug: string; title: string; summary: string | null; productId: string | null; startingCents: number | null; tiers: { id: string; name: string; priceCents: number; deliverables: string[]; note?: string }[]; deliverables: string[]; options: { id: string; label: string; priceDeltaCents: number }[]; intake: { id: string; label: string; hint?: string; required?: boolean }[]; turnaroundDays: number | null; bookingShape: string; slotMinutes: number | null }
export interface InfluencerCard { id: string; slug: string; name: string; avatarUrl: string | null; bio: string | null; verified: boolean; tier: string; avgRating: number | null; collabs: number; serviceArea: string[]; audience: Audience | null; fromCents: number | null; offerCount: number; sample: CreatorPost[]; example: boolean }
export interface InfluencerProfile extends InfluencerCard { offers: Offer[]; posts: CreatorPost[]; collabsDone: CreatorPost[]; reviews: Review[]; schedule: { available: boolean; confirmMode: 'instant' | 'request'; timezone: string | null; slots: { date: string; start: string; end: string }[] } }

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

function shapeAudience(r: Record<string, unknown> | null): Audience | null {
  if (!r) return null
  const platforms = (Array.isArray(r.platforms) ? r.platforms : []) as Platform[]
  return { city: (r.city as string) ?? null, platforms, followers: n(r.followers), avgViews: n(r.avg_views), engagement: n(r.engagement), localPct: n(r.local_pct), ages: (r.ages as string) ?? null, cuisines: arr(r.cuisines), styles: arr(r.styles), languages: arr(r.languages), responseHours: n(r.response_hours), postsWithinDays: n(r.posts_within_days) ?? 5, partySize: n(r.party_size) ?? 2, mealCapCents: n(r.meal_cap_cents) ?? 6000, repostOk: r.repost_ok !== false, whitelistCents: n(r.whitelist_cents), verifiedAt: (r.verified_at as string) ?? null }
}
function shapePost(r: Record<string, unknown>, names: Map<string, string>): CreatorPost {
  let listing: string | null = null
  try { const nt = r.booking_note ? JSON.parse(String(r.booking_note)) : null; listing = nt?.listingTitle ?? null } catch { /* plain */ }
  return { id: String(r.id), kind: r.kind === 'collab' ? 'collab' : 'sample', platform: String(r.platform ?? 'instagram'), url: (r.url as string) ?? null, thumb: (r.thumb_url as string) ?? null, caption: (r.caption as string) ?? null, views: n(r.views), likes: n(r.likes), saves: n(r.saves), comments: n(r.comments), linkTaps: n(r.link_taps), postedAt: (r.posted_at as string) ?? null, restaurant: r.client_id ? names.get(String(r.client_id)) ?? null : null, listing, note: (r.note as string) ?? null }
}
function shapeOffer(row: ListingRow): Offer {
  const p: CreatorPackage = rowToPackage(row)
  const tiers = (p.tiers ?? []).map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, deliverables: t.deliverables ?? [], note: t.note }))
  const starting = tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : row.price_cents
  return { slug: row.slug, title: row.title, summary: row.description, productId: p.productId ?? null, startingCents: starting ?? null, tiers, deliverables: p.deliverables ?? [], options: (p.options ?? []).map((o) => ({ id: o.id, label: o.label, priceDeltaCents: o.priceDeltaCents })), intake: (p.intake ?? []).map((i) => ({ id: i.id, label: i.label, hint: i.hint, required: i.required })), turnaroundDays: p.turnaroundDays ?? null, bookingShape: p.bookingShape ?? 'scheduled', slotMinutes: p.slotMinutes ?? null }
}

/** every bookable creator with a food_influencer offer in the state, plus their audience row and a few sample posts */
export async function listInfluencers(admin: Admin, state = 'WA'): Promise<InfluencerCard[]> {
  const { data: listings } = await admin.from('vendor_listings').select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, active').eq('category', 'food_influencer').eq('active', true)
  const byVendor = new Map<string, ListingRow[]>()
  for (const l of (listings ?? []) as ListingRow[]) { const k = String(l.vendor_id); byVendor.set(k, [...(byVendor.get(k) ?? []), l]) }
  const ids = Array.from(byVendor.keys())
  if (!ids.length) return []
  const [vendors, aud, posts] = await Promise.all([
    admin.from('vendors').select('id, slug, name, logo_url, description, verified, tier, avg_rating, total_bookings, service_area, bookable, vendor_type').in('id', ids).eq('bookable', true).neq('vendor_type', 'apnosh').contains('service_area', [state]),
    admin.from('creator_audience').select('*').in('vendor_id', ids),
    admin.from('creator_posts').select('*').in('vendor_id', ids).order('posted_at', { ascending: false }).limit(200),
  ])
  const audBy = new Map<string, Record<string, unknown>>()
  for (const a of ((aud.data ?? []) as Record<string, unknown>[])) audBy.set(String(a.vendor_id), a)
  const postsBy = new Map<string, Record<string, unknown>[]>()
  for (const p of ((posts.data ?? []) as Record<string, unknown>[])) { const k = String(p.vendor_id); postsBy.set(k, [...(postsBy.get(k) ?? []), p]) }
  const names = new Map<string, string>()
  return ((vendors.data ?? []) as Record<string, unknown>[]).map((v) => {
    const id = String(v.id)
    const offers = (byVendor.get(id) ?? []).map(shapeOffer)
    const from = offers.map((o) => o.startingCents).filter((x): x is number => x != null)
    return { id, slug: String(v.slug), name: String(v.name).replace(/\s*\(Example\)\s*$/i, ''), avatarUrl: (v.logo_url as string) ?? null, bio: (v.description as string) ?? null, verified: v.verified === true, tier: String(v.tier ?? 'free'), avgRating: n(v.avg_rating), collabs: n(v.total_bookings) ?? 0, serviceArea: arr(v.service_area), audience: shapeAudience(audBy.get(id) ?? null), fromCents: from.length ? Math.min(...from) : null, offerCount: offers.length, sample: (postsBy.get(id) ?? []).slice(0, 3).map((p) => shapePost(p, names)), example: /\(Example\)\s*$/i.test(String(v.name)) }
  })
}

export async function getInfluencer(admin: Admin, slug: string, state = 'WA'): Promise<InfluencerProfile | null> {
  const { data: v } = await admin.from('vendors').select('id, slug, name, logo_url, description, verified, tier, avg_rating, total_bookings, service_area, bookable, vendor_type').eq('slug', slug).eq('bookable', true).maybeSingle()
  if (!v) return null
  const id = String(v.id)
  const [listings, aud, posts, ratings, schedule] = await Promise.all([
    admin.from('vendor_listings').select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, active').eq('vendor_id', id).eq('category', 'food_influencer').eq('active', true).order('display_order', { ascending: true }),
    admin.from('creator_audience').select('*').eq('vendor_id', id).maybeSingle(),
    admin.from('creator_posts').select('*, bookings(note)').eq('vendor_id', id).order('posted_at', { ascending: false }).limit(40),
    admin.from('work_ratings').select('stars, comment, created_at, client_id').eq('creator_id', id).order('created_at', { ascending: false }).limit(20),
    getVendorSchedule(id, new Date().toISOString(), 80).catch(() => ({ available: false, confirmMode: 'request' as const, timezone: null, slots: [] as { date: string; start: string; end: string }[] })),
  ])
  const postRows: Record<string, unknown>[] = ((posts.data ?? []) as Record<string, unknown>[]).map((p) => ({ ...p, booking_note: (p.bookings as { note?: string } | null)?.note ?? null }))
  const clientIds = Array.from(new Set([...postRows.map((p) => p.client_id), ...((ratings.data ?? []) as Record<string, unknown>[]).map((r) => r.client_id)].filter(Boolean).map(String)))
  const names = new Map<string, string>()
  if (clientIds.length) { const { data: cs } = await admin.from('clients').select('id, name').in('id', clientIds); for (const c of (cs ?? []) as { id: string; name: string }[]) names.set(c.id, c.name) }
  const offers = ((listings.data ?? []) as ListingRow[]).map(shapeOffer)
  const all = postRows.map((p) => shapePost(p, names))
  const from = offers.map((o) => o.startingCents).filter((x): x is number => x != null)
  return {
    id, slug: String(v.slug), name: String(v.name).replace(/\s*\(Example\)\s*$/i, ''), avatarUrl: (v.logo_url as string) ?? null, bio: (v.description as string) ?? null, verified: v.verified === true, tier: String(v.tier ?? 'free'), avgRating: n(v.avg_rating), collabs: n(v.total_bookings) ?? 0, serviceArea: arr(v.service_area), audience: shapeAudience((aud.data as Record<string, unknown>) ?? null), fromCents: from.length ? Math.min(...from) : null, offerCount: offers.length, sample: all.filter((p) => p.kind === 'sample').slice(0, 3), example: /\(Example\)\s*$/i.test(String(v.name)),
    offers, posts: all.filter((p) => p.kind === 'sample').slice(0, 9), collabsDone: all.filter((p) => p.kind === 'collab').slice(0, 8),
    reviews: ((ratings.data ?? []) as Record<string, unknown>[]).map((r) => ({ stars: Number(r.stars), comment: (r.comment as string) ?? null, when: String(r.created_at).slice(0, 10), restaurant: r.client_id ? names.get(String(r.client_id)) ?? null : null })),
    schedule: { available: schedule.available, confirmMode: schedule.confirmMode, timezone: schedule.timezone, slots: schedule.slots.map((s) => ({ date: s.date, start: s.start, end: s.end })) },
  }
}

/* ── fit: who suits this restaurant, and why, in words ── */
export interface FitCtx { cuisine?: string | null; city?: string | null; state?: string; goal?: 'faces' | 'slow' | 'dish' | 'place' | null; maxCents?: number | null }
export interface Fit { slug: string; score: number; reasons: string[]; tag: string }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
export function fitInfluencers(cards: InfluencerCard[], ctx: FitCtx): Fit[] {
  const out: Fit[] = cards.map((c) => {
    const a = c.audience
    let score = 0
    const reasons: string[] = []
    if (a?.localPct != null) { score += a.localPct; reasons.push(`${a.localPct}% of the people who watch are nearby`) }
    if (ctx.cuisine && a?.cuisines.some((x) => norm(x) === norm(ctx.cuisine!) || norm(ctx.cuisine!).includes(norm(x)))) { score += 40; reasons.push(`Posts ${ctx.cuisine} already`) }
    if (ctx.city && a?.city && norm(a.city) === norm(ctx.city)) { score += 25; reasons.push(`Based in ${a.city}`) }
    const reach = a?.avgViews ?? a?.followers ?? 0
    if (reach) { score += Math.min(40, Math.log10(reach + 1) * 8); reasons.push(`About ${fmt(reach)} people see a post`) }
    if (c.fromCents != null && ctx.maxCents != null) { if (c.fromCents <= ctx.maxCents) { score += 15; reasons.push(`From $${Math.round(c.fromCents / 100)}, inside your comp`) } else { score -= 30; reasons.push(`Starts above your comp`) } }
    if (c.avgRating != null && c.collabs > 0) { score += Math.min(15, c.collabs) + c.avgRating * 2; reasons.push(`${c.avgRating.toFixed(1)} stars over ${c.collabs} collab${c.collabs === 1 ? '' : 's'}`) }
    if (a?.verifiedAt) score += 10
    if (ctx.goal === 'dish' && a?.avgViews) score += 5
    return { slug: c.slug, score: Math.round(score), reasons: reasons.slice(0, 3), tag: '' }
  }).sort((x, y) => y.score - x.score)
  if (out[0]) out[0].tag = 'Best fit'
  const byReach = [...cards].filter((c) => (c.audience?.avgViews ?? c.audience?.followers ?? 0) > 0).sort((x, y) => (y.audience?.avgViews ?? y.audience?.followers ?? 0) - (x.audience?.avgViews ?? x.audience?.followers ?? 0))[0]
  const cheapest = [...cards].filter((c) => c.fromCents != null).sort((x, y) => (x.fromCents ?? 0) - (y.fromCents ?? 0))[0]
  for (const f of out) { if (!f.tag && byReach && f.slug === byReach.slug) f.tag = 'Most reach'; else if (!f.tag && cheapest && f.slug === cheapest.slug) f.tag = 'Easiest on the budget' }
  return out
}
export const fmt = (v: number) => (v >= 1_000_000 ? `${(v / 1e6).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
