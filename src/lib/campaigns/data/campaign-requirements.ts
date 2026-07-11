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

import { ITEM_SHAPE } from '../builder/compose-plan'
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

/** Same service sets service-needs.ts keys on (kept in lockstep by voice, not import — that
 *  module is server-only and cannot be pulled into this client-safe file). */
const MENU_SERVICES = new Set(['site-menu', 'menu-eng', 'catering-engine', 'menu-photo-refresh'])
const LIST_SERVICES = new Set(['crm-list', 'email-found'])

/** Seed beat types that mean a camera has to visit before the piece can exist. */
const SHOOT_BEATS = new Set(['reel', 'video', 'photo'])

/** What the owner must provide before this campaign can complete. Deduped, plain words,
 *  sentence case. [] when nothing is genuinely required (e.g. a text-only send). */
export function requirementsFor(itemId: string): string[] {
  const shape = ITEM_SHAPE[itemId]
  if (!shape) return []
  const out: string[] = []
  const push = (ask: string) => { if (!out.includes(ask)) out.push(ask) }

  for (const serviceId of shape.services ?? []) {
    const t = turnaroundFor(serviceId)
    if (t?.class === 'setup' && t.gate) {
      const ask = GATE_ASK[t.gate.kind]
      if (ask) push(ask)
    }
    if (t?.class === 'creative' && t.needsShoot) push(SHOOT_ASK)
    if (MENU_SERVICES.has(serviceId)) push('Send us your current menu')
    if (LIST_SERVICES.has(serviceId)) push('Share your customer list')
  }

  // Any seed piece that needs filming or a photographer implies the shoot ask too.
  if ((shape.seed ?? []).some(([type]) => SHOOT_BEATS.has(type))) push(SHOOT_ASK)

  return out
}
