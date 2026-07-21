/**
 * requirementsFor — what the OWNER must provide before a campaign can complete, derived from the
 * campaign's REAL composition (ITEM_SHAPE services + seed beats) and each service's turnaround
 * gate (service-turnaround.ts). This is the client-safe, plain-words sibling of the server-only
 * deriveServiceNeeds (service-needs.ts): same signals, same voice, but a pure string list with no
 * campaign/execution state — for showing "what we'll need from you" BEFORE anything ships.
 *
 * Phase A of the campaign-catalog systemization: exported + drift-guarded by
 * scripts/verify-catalog-ids.ts, not rendered anywhere yet (Phase B).
 *
 * PURE + synchronous + CLIENT-SAFE: no server-only, no fetch, total on unknown ids (returns []).
 */

import { shapeFor } from '../builder/compose-plan'
import { turnaroundFor } from './service-turnaround'

/** Gate kind → the plain ask, in service-needs.ts's voice. 'external' gates carry no owner ask. */
const GATE_ASK: Record<string, string | undefined> = {
  'gbp-verify': 'Connect your Google profile',
  'listing-propagation': 'Connect your listings',
  'pos-vendor': 'Tell us your ordering or POS system',
  'sms-10dlc': 'Your business details for text messaging',
  'print': 'Your shipping address',
}

const SHOOT_ASK = 'Pick times for a photo or video shoot'

/** Per-service asks that OVERRIDE the gate-kind default above.
 *
 *  The gate map is keyed on the turnaround gate, so every 'pos-vendor' service promised
 *  "Tell us your ordering or POS system". The Google button card stopped asking that (the
 *  intake wants the LINK, which is the thing we write onto the listing), and this file did
 *  not follow, so the product page sold one question and the order asked another.
 *
 *  This file's own comment predicted it: the two are "kept in lockstep by voice, not
 *  import", because service-needs.ts is server-only and cannot be pulled in here. An
 *  override map is the smallest honest patch. If this list grows past a few entries, the
 *  right fix is a shared client-safe source both can read. */
const SERVICE_ASK: Record<string, string> = {
  'google-food-order': 'Your online ordering link, and your booking link if you take reservations',
}

/** Same service sets service-needs.ts keys on (kept in lockstep by voice, not import — that
 *  module is server-only and cannot be pulled into this client-safe file). */
const MENU_SERVICES = new Set(['site-menu', 'menu-eng', 'catering-engine', 'menu-photo-refresh'])
const LIST_SERVICES = new Set(['crm-list', 'email-found'])

/** Seed beat types that mean a camera has to visit before the piece can exist. */
const SHOOT_BEATS = new Set(['reel', 'video', 'photo'])

/** The per-service asks, shared by the id path and the services-only path (admin preview).
 *  Deduped into `out` in catalog order. */
function pushServiceAsks(serviceIds: string[], out: string[], shootAsk: string): void {
  const push = (ask: string) => { if (!out.includes(ask)) out.push(ask) }
  for (const serviceId of serviceIds) {
    const t = turnaroundFor(serviceId)
    if (t?.class === 'setup' && t.gate) {
      const ask = SERVICE_ASK[serviceId] ?? GATE_ASK[t.gate.kind]
      if (ask) push(ask)
    }
    if (t?.class === 'creative' && t.needsShoot) push(shootAsk)
    if (MENU_SERVICES.has(serviceId)) push('Send us your current menu')
    if (LIST_SERVICES.has(serviceId)) push('Share your customer list')
  }
}

/** What the owner must provide before this campaign can complete. Deduped, plain words,
 *  sentence case. [] when nothing is genuinely required (e.g. a text-only send).
 *  Resolves DB campaigns too via shapeFor (their registered shape is services-only). */
export function requirementsFor(itemId: string): string[] {
  const shape = shapeFor(itemId)
  if (!shape) return []
  const out: string[] = []
  // 'edit' cuts the OWNER's footage — its reel/photo beats need their files, not a camera visit.
  const shootAsk = itemId === 'edit' ? 'Send us your clips and photos' : SHOOT_ASK

  pushServiceAsks(shape.services ?? [], out, shootAsk)

  // Any seed piece that needs filming or a photographer implies the shoot ask too.
  if ((shape.seed ?? []).some(([type]) => SHOOT_BEATS.has(type))) {
    if (!out.includes(shootAsk)) out.push(shootAsk)
  }

  return out
}

/** Requirements derived from a bare service list — the admin CMS preview path (Phase C2),
 *  where the campaign may not be registered (or even saved) yet. Same asks, same voice,
 *  same derivation as requirementsFor over a services-only shape. */
export function requirementsForServices(serviceIds: string[]): string[] {
  const out: string[] = []
  pushServiceAsks(serviceIds, out, SHOOT_ASK)
  return out
}
