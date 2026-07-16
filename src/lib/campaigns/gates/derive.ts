/**
 * Checkout Gates — pure gate derivation. Decides which pre-checkout gates a composed draft needs,
 * from the SAME signals the post-checkout readiness page already uses (service-needs.ts:83-92), so a
 * shoot-bearing campaign asks for a real shoot date BEFORE payment instead of a free-text guess after.
 *
 * Phase 2 implements the SMART DEFAULT only: a draft with a needsShoot service (or a shoot-bearing
 * content beat) implies a required pre-checkout 'shoot' booking gate. The per-campaign gates-config
 * override (catalog_*.gates) is applied on top in Phase 4 when its editor ships. Pure + client-safe.
 */
import { turnaroundFor } from '../data/service-turnaround'
import type { CampaignDraft } from '../types'
import type { GateDef } from './types'

const isContent = (serviceId?: string) => /^content-/.test(serviceId ?? '')
const SHOOT_BEAT_TYPES = new Set(['reel', 'video', 'photo'])

/** True when this draft involves an on-site shoot the team will run — either a needsShoot service or a
 *  shoot-bearing content beat. Mirrors deriveServiceNeeds' shoot predicate exactly. Owner-run ('diy')
 *  and opted-out lines never imply team shoot work. */
export function draftNeedsShoot(draft: Pick<CampaignDraft, 'items' | 'brief'>): boolean {
  const beatTypes = new Set((draft.brief?.contentBeats ?? []).map((b) => (b as { type?: string }).type))
  const shootFromBeats = [...SHOOT_BEAT_TYPES].some((t) => beatTypes.has(t))
  const shootFromServices = (draft.items ?? []).some((it) => {
    if (!it.included || it.optOut || it.producer === 'diy' || isContent(it.serviceId)) return false
    const t = turnaroundFor(it.serviceId)
    return t?.class === 'creative' && !!t.needsShoot
  })
  return shootFromBeats || shootFromServices
}

/** The required PRE-CHECKOUT booking gates for a draft (smart default). Empty when nothing needs a
 *  firm agreement before payment. */
export function requiredBookingGates(draft: Pick<CampaignDraft, 'items' | 'brief'>): GateDef[] {
  if (draftNeedsShoot(draft)) {
    return [{ id: 'shoot', kind: 'booking', gateKind: 'shoot', when: 'pre-checkout', required: true }]
  }
  return []
}

/** Convenience: does this draft need a pre-checkout booking at all? */
export function draftHasPreCheckoutBooking(draft: Pick<CampaignDraft, 'items' | 'brief'>): boolean {
  return requiredBookingGates(draft).some((g) => g.kind === 'booking' && g.when === 'pre-checkout')
}
