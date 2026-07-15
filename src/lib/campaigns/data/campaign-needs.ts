/**
 * campaignAutoNeeds — the STRUCTURED list of auto-detected post-checkout asks a campaign generates,
 * derived from its real composition (shapeFor services + seed beats). The client-safe, structured
 * sibling of the server-only service-needs.ts + readiness.ts static asks: same ids, same titles, so
 * an owner's Required/Optional/Off override (keyed by id) maps 1:1 to what the client is asked.
 *
 * Used by the campaign builder's "what we need from you" editor to show the real toggle list.
 * PURE + synchronous + CLIENT-SAFE: no server-only, no fetch, [] on unknown ids.
 */
import { shapeFor } from '../builder/compose-plan'
import { turnaroundFor } from './service-turnaround'

/** One auto-detected ask + its default requiredness (matches service-needs.ts / readiness.ts). */
export interface AutoNeed {
  id: string
  title: string
  group: string
  /** How it's treated by default, before any owner override. */
  defaultOptional: boolean
}

const MENU_SERVICES = new Set(['site-menu', 'menu-eng', 'catering-engine', 'menu-photo-refresh'])
const LIST_SERVICES = new Set(['crm-list', 'email-found'])
const SHOOT_BEATS = new Set(['reel', 'video', 'photo'])

// Gate kind → the owner ask it implies (id + title in service-needs.ts's exact voice).
const GATE_NEED: Record<string, AutoNeed | undefined> = {
  'gbp-verify': { id: 'gbp-access', title: 'Connect your Google profile', group: 'Access', defaultOptional: false },
  'listing-propagation': { id: 'listing-access', title: 'Connect your listings', group: 'Access', defaultOptional: false },
  'pos-vendor': { id: 'pos-vendor', title: 'Which ordering or POS system do you use?', group: 'Access', defaultOptional: false },
  'sms-10dlc': { id: 'sms-register', title: 'Set up text messaging', group: 'Info', defaultOptional: false },
  'print': { id: 'print-address', title: 'Confirm your shipping address', group: 'Info', defaultOptional: false },
}

const SHOOT_NEEDS: AutoNeed[] = [
  { id: 'shootTimes', title: 'Best days and times to film', group: 'Shoot', defaultOptional: false },
  { id: 'onSiteContact', title: 'Who should we ask for?', group: 'Shoot', defaultOptional: false },
  { id: 'filmStaff', title: 'OK to film and tag your staff?', group: 'Shoot', defaultOptional: false },
  { id: 'accessNotes', title: 'Parking or entry notes', group: 'Shoot', defaultOptional: true },
  { id: 'blackoutDates', title: 'Any busy dates to avoid', group: 'Scheduling', defaultOptional: true },
]

const CONTENT_NEEDS: AutoNeed[] = [
  { id: 'featuring', title: 'What should we feature?', group: 'Content', defaultOptional: false },
  { id: 'mustSay', title: 'Anything we must include?', group: 'Content', defaultOptional: true },
  { id: 'avoid', title: 'Anything to avoid?', group: 'Content', defaultOptional: true },
]

const GO_LIVE: AutoNeed = { id: 'go_live', title: 'When do you want to go live?', group: 'Scheduling', defaultOptional: false }

/** The asks a shipped instance of this campaign would auto-generate (best-effort, composition-only —
 *  client-signal-driven asks like "add a card" or "connect Instagram" are situational, not listed). */
export function campaignAutoNeeds(itemId: string): AutoNeed[] {
  const shape = shapeFor(itemId)
  if (!shape) return []
  const services = shape.services ?? []
  const out: AutoNeed[] = []
  const seen = new Set<string>()
  const push = (n: AutoNeed) => { if (!seen.has(n.id)) { seen.add(n.id); out.push(n) } }

  // Content work? (content-* services or content seed beats) → the content inputs.
  const hasContent = services.some((s) => /^content-/.test(s)) || (shape.seed ?? []).some(([type]) => SHOOT_BEATS.has(type))
  if (hasContent) CONTENT_NEEDS.forEach(push)

  // Always: the go-live date.
  push(GO_LIVE)

  // Service gates + menu/list.
  for (const s of services) {
    const t = turnaroundFor(s)
    if (t?.class === 'setup' && t.gate) { const n = GATE_NEED[t.gate.kind]; if (n) push(n) }
    if (MENU_SERVICES.has(s)) push({ id: 'menu-source', title: 'Send us your current menu', group: 'Content', defaultOptional: false })
    if (LIST_SERVICES.has(s)) push({ id: 'customer-list', title: 'Share your customer list', group: 'Info', defaultOptional: false })
  }

  // Shoot? (a creative service that needs a shoot, or a shoot seed beat) → the shoot inputs.
  const needsShoot = services.some((s) => { const t = turnaroundFor(s); return t?.class === 'creative' && !!t.needsShoot })
    || (shape.seed ?? []).some(([type]) => SHOOT_BEATS.has(type))
  if (needsShoot) SHOOT_NEEDS.forEach(push)

  return out
}
