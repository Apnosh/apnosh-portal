import 'server-only'
/**
 * Booking a creator from the influencer marketplace (owner 2026-09-17).
 *
 * The brief is the booking. It lands as a bookings row the creator already knows how to read
 * (held until they say yes on /creator/bookings, or confirmed at once when they allow instant
 * booking), with the intake carrying the brief. Then a plan of kind 'collab' on announcements:
 * the ask, the team card, the visit, the post, the repost, the results, the pay. The creator is
 * paid only after the post is up and approved, through the work-order rail that already does it.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import { getVendorRule, bookingsForRule, CREATOR_GATE_KIND } from '@/lib/marketplace/creator-schedule'
import { mintBookingWorkOrder } from '@/lib/marketplace/booking-work-order'
import { notifyClientOwners, createNotification } from '@/lib/notifications'
import { getInfluencer, type InfluencerProfile } from './read'

type Admin = ReturnType<typeof createAdminClient>
export interface Brief { try: string; know?: string; avoid?: string; party?: number; tag?: boolean; repost?: boolean; whitelist?: boolean; code?: boolean; when?: string }
export interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }
const day = (d: Date) => d.toISOString().slice(0, 10)
const plus = (iso: string, n: number) => day(new Date(Date.parse(iso + 'T12:00:00') + n * 86400000))
const clean = (s: unknown, max = 500) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const nice = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const hour = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}` }
const codeFor = (name: string) => `${name.split(' ')[0].replace(/[^a-z]/gi, '').toUpperCase().slice(0, 8) || 'CREATOR'}10`

export async function bookInfluencer(admin: Admin, o: { clientId: string; userId: string; slug: string; listingSlug: string; tierName?: string | null; date?: string | null; start?: string | null; brief: Brief; restaurant: { name: string; handle?: string | null } }): Promise<{ ok: true; bookingId: string; status: string; plan: Line[]; total: number; announcementId: string | null } | { ok: false; error: string }> {
  const p: InfluencerProfile | null = await getInfluencer(admin, o.slug)
  if (!p) return { ok: false, error: 'That creator is not on the marketplace any more' }
  const offer = p.offers.find((x) => x.slug === o.listingSlug) ?? p.offers[0]
  if (!offer) return { ok: false, error: 'That creator has no offer to book' }
  const tier = offer.tiers.find((t) => t.name === o.tierName) ?? offer.tiers[0] ?? null
  const fee = tier?.priceCents ?? offer.startingCents ?? 0
  const a = p.audience
  const brief: Brief = { try: clean(o.brief.try, 400), know: clean(o.brief.know, 400) || undefined, avoid: clean(o.brief.avoid, 300) || undefined, party: Math.max(1, Math.min(6, Number(o.brief.party) || a?.partySize || 2)), tag: o.brief.tag !== false, repost: o.brief.repost !== false && (a?.repostOk ?? true), whitelist: o.brief.whitelist === true && a?.whitelistCents != null, code: o.brief.code !== false, when: clean(o.brief.when, 120) || undefined }
  if (!brief.try) return { ok: false, error: 'Say what they should try' }
  const options = brief.whitelist && a?.whitelistCents != null ? [{ label: 'Whitelist for your ads', priceDeltaCents: a.whitelistCents }] : []
  const code = brief.code ? codeFor(p.name) : null
  const intake: Record<string, string> = { try: brief.try, ...(brief.know ? { know: brief.know } : {}), ...(brief.avoid ? { avoid: brief.avoid } : {}), party: String(brief.party), tag: brief.tag ? `Tag ${o.restaurant.handle ? '@' + o.restaurant.handle.replace(/^@/, '') + ' and ' : ''}the location` : 'No tag needed', repost: brief.repost ? 'The restaurant may repost, credited' : 'No repost', ...(code ? { code: `${code}, 10% off for your followers` } : {}), ...(brief.when && !o.date ? { when: brief.when } : {}), meal: `The meal is on the restaurant, up to $${Math.round((a?.mealCapCents ?? 6000) / 100)} for ${brief.party}` }

  /* the slot: their calendar when they keep one and the time is still open; a request otherwise */
  let slot: { date: string; start: string; end: string; timezone: string; ruleId: string } | null = null
  let instant = false
  const found = await getVendorRule(p.id).catch(() => null)
  if (found && o.date && o.start) {
    const rule = offer.slotMinutes ? { ...found.rule, slotMinutes: offer.slotMinutes } : found.rule
    const taken = await bookingsForRule(found.rule.id)
    const s = computeOpenSlots(rule, taken, new Date().toISOString(), 400).find((x) => x.date === o.date && x.start === o.start)
    if (!s) return { ok: false, error: 'That time was just taken. Pick another' }
    slot = { date: s.date, start: s.start, end: s.end, timezone: found.rule.timezone, ruleId: found.rule.id }
    instant = found.confirmMode === 'instant'
  }
  const meta = { kind: 'creator', vendorId: p.id, vendorSlug: p.slug, listingId: null as string | null, listingSlug: offer.slug, listingTitle: offer.title, tierName: tier?.name ?? null, intake, ...(options.length ? { options } : {}), ...(slot ? {} : { shape: 'async' as const }), collab: true }
  const { data: lid } = await admin.from('vendor_listings').select('id').eq('vendor_id', p.id).eq('slug', offer.slug).maybeSingle()
  meta.listingId = (lid?.id as string) ?? null
  const row = { client_id: o.clientId, gate_kind: CREATOR_GATE_KIND, rule_id: slot?.ruleId ?? null, slot_date: slot?.date ?? null, slot_start: slot?.start ?? null, slot_end: slot?.end ?? null, timezone: slot?.timezone ?? 'America/Los_Angeles', status: instant ? 'confirmed' : 'held', hold_expires_at: instant ? null : new Date(Date.now() + 3 * 86400000).toISOString(), note: JSON.stringify(meta), created_by: o.userId, updated_at: new Date().toISOString() }
  const { data: b, error } = await admin.from('bookings').insert(row).select('id').single()
  if (error || !b) return { ok: false, error: error?.message ?? 'Could not send the ask' }
  const bookingId = String(b.id)
  if (instant) await mintBookingWorkOrder(bookingId).catch(() => null)

  /* the plan */
  const first = p.name.split(' ')[0]
  const visit = slot?.date ?? (o.date || null)
  const postBy = visit ? plus(visit, a?.postsWithinDays ?? 5) : null
  const total = fee + options.reduce((s, x) => s + x.priceDeltaCents, 0)
  const href = '/dashboard/bookings'
  const plan: Line[] = [
    { key: 'ask', label: instant ? `${first} is booked` : `${first} gets the ask`, detail: `${visit ? `${nice(visit)}${slot ? `, ${hour(slot.start)}` : ''}, ` : ''}${offer.title}${tier ? `, ${tier.name.toLowerCase()}` : ''}. The brief goes with it`, date: day(new Date()), cost: null, status: instant ? 'done' : 'with_team', ref: { kind: 'booking', id: bookingId, href }, why: instant ? undefined : `${first} says yes within a day, or offers another time` },
    { key: 'team', label: 'Tell the team', detail: `One card: ${first}, party of ${brief.party}${slot ? `, ${hour(slot.start)}` : ''}, ${brief.try}. The meal is on us${code ? `. ${code} is live` : ''}`, date: visit ? plus(visit, -1) : null, cost: null, status: 'later', ref: null },
    { key: 'visit', label: 'The visit', detail: visit ? `${nice(visit)}${slot ? `, ${hour(slot.start)}` : ''}. A reminder that morning` : `${first} offers two dates in your bookings`, date: visit, cost: null, status: 'later', ref: { kind: 'booking', id: bookingId, href } },
    { key: 'post', label: `${first}'s post goes up`, detail: `Within ${a?.postsWithinDays ?? 5} days of the visit. You see the link first. ${brief.tag ? 'Tagged, location on' : ''}`.trim(), date: postBy, cost: fee, status: 'later', ref: { kind: 'booking', id: bookingId, href }, why: 'Nothing is charged until it is up' },
    ...(brief.whitelist && a?.whitelistCents != null ? [{ key: 'whitelist', label: 'Boost it from their handle', detail: 'Their post as your ad. Set the budget in Boost once it is up', date: postBy, cost: a.whitelistCents, status: 'later' as const, ref: { kind: 'page', id: null, href: '/dashboard/boost' } }] : []),
    ...(brief.repost ? [{ key: 'repost', label: 'Repost it', detail: `${first}'s post on your account, credited, at your best hour`, date: postBy, cost: null, status: 'later' as const, ref: null, why: 'Their post reaches their people. Yours reaches yours' }] : []),
    { key: 'results', label: 'What it did', detail: `Views, saves, new followers${code ? `, ${code} used` : ''}. In Coming up`, date: postBy ? plus(postBy, 7) : null, cost: null, status: 'later', ref: { kind: 'booking', id: bookingId, href } },
    { key: 'paid', label: `${first} is paid`, detail: 'Apnosh pays them. You are charged only then', date: postBy ? plus(postBy, 7) : null, cost: null, status: 'later', ref: { kind: 'booking', id: bookingId, href } },
  ]
  let announcementId: string | null = null
  try {
    const { data: ann } = await admin.from('announcements').insert({ client_id: o.clientId, kind: 'collab', status: 'in_progress', answers: { what: `${p.name}, ${offer.title.toLowerCase()}`, creator: p.slug, code: code ?? '', try: brief.try }, picture: {}, places: { bookingId }, timing: { date: visit, postBy }, words: {}, plan, total_cents: total, created_by: o.userId }).select('id').single()
    announcementId = (ann?.id as string) ?? null
  } catch { /* 267 not applied yet: the booking still stands */ }
  notifyClientOwners(o.clientId, { kind: 'client_request', title: instant ? `${p.name} is booked` : `Ask sent to ${p.name}`, body: `${offer.title}${visit ? `, ${nice(visit)}` : ''}. ${instant ? 'It is on your calendar.' : `${first} answers within a day.`}`, link: href }).catch(() => {})
  const { data: v } = await admin.from('vendors').select('person_id').eq('id', p.id).maybeSingle()
  if (v?.person_id) createNotification({ userId: String(v.person_id), kind: 'client_request', title: `${o.restaurant.name} wants to book you`, body: `${offer.title}${tier ? `, ${tier.name}` : ''}${visit ? `, ${nice(visit)}` : ''}. Say yes in your bookings.`, link: '/creator/bookings' }).catch(() => {})
  return { ok: true, bookingId, status: row.status, plan, total, announcementId }
}
