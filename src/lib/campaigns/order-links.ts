/**
 * order-links — the honest read of a Google listing's Order / Reserve buttons.
 *
 * Pure and I/O-free so it can be tested without Google. The caller hands it the
 * raw placeActionLinks from mybusinessplaceactions (see gbp-place-actions.ts) and
 * gets back a plain-language diagnosis the owner can act on.
 *
 * Everything here is COUNTED from the rows, never asserted. The reason that matters:
 * the business record is demonstrably wrong about this. Yellow Bee's onboarding answers
 * say delivery_platforms ["none"] and reservations_platform "none", while their live
 * listing carries six DoorDash links. So the live read is the only truth we have, and
 * nothing in this module may fall back to the self-reported fields.
 *
 * The three facts that drive every decision:
 *   isEditable === true          → the link is OURS to change
 *   providerType AGGREGATOR_3P   → Google owns it, read-only, cannot be removed
 *   a slot with no link at all   → free to claim
 */

/** The four buttons we can set. SHOP_ONLINE also appears on real listings but is
 *  aggregator-only (never settable by us), so it is reported, never offered. */
export type OwnableActionType = 'FOOD_ORDERING' | 'FOOD_DELIVERY' | 'FOOD_TAKEOUT' | 'DINING_RESERVATION'

export const OWNABLE_TYPES: { type: OwnableActionType; label: string }[] = [
  { type: 'FOOD_ORDERING', label: 'Order online' },
  { type: 'FOOD_DELIVERY', label: 'Delivery' },
  { type: 'FOOD_TAKEOUT', label: 'Takeout' },
  { type: 'DINING_RESERVATION', label: 'Reserve a table' },
]

const LABELS: Record<string, string> = {
  ...Object.fromEntries(OWNABLE_TYPES.map((t) => [t.type, t.label])),
  SHOP_ONLINE: 'Shop online',
}

/** Known ordering middlemen, host to the name the OWNER would recognise.
 *
 *  Used only to say where a link currently points, never to decide what is editable
 *  (that is isEditable, straight from Google).
 *
 *  Spelled out rather than derived from the host: mangling 'doordash.com' into a
 *  display name gives "Doordash", while order.online (DoorDash's white-label
 *  storefront) has to be spelled anyway. Two spellings for one company also broke the
 *  "every button goes to X" check, since it counts distinct names. Brands are data. */
const AGGREGATORS: Record<string, string> = {
  'doordash.com': 'DoorDash',
  'order.online': 'DoorDash', // DoorDash's white-label storefront
  'ubereats.com': 'Uber Eats',
  'grubhub.com': 'Grubhub',
  'postmates.com': 'Postmates',
  'seamless.com': 'Seamless',
  'slicelife.com': 'Slice',
  'chownow.com': 'ChowNow',
  'toasttab.com': 'Toast',
  'opentable.com': 'OpenTable',
  'resy.com': 'Resy',
  'yelp.com': 'Yelp',
}

export interface RawActionLink {
  name?: string
  uri?: string
  placeActionType?: string
  providerType?: string
  isEditable?: boolean
}

export interface ReadLink {
  /** Google's own id for the link, needed to patch or delete it. */
  name: string | null
  type: string
  label: string
  uri: string
  /** True when Google says we may change it. Straight from isEditable, never inferred. */
  ours: boolean
  /** The middleman this points at, when we recognise one. null = not a known app. */
  goesTo: string | null
}

export interface OrderLinksRead {
  /** Links we can change today. */
  ours: ReadLink[]
  /** Links Google adds and locks. Reported so the owner is never told they vanish. */
  locked: ReadLink[]
  /** Ownable buttons with nothing in them at all. The free wins. */
  emptySlots: { type: OwnableActionType; label: string }[]
  /** Ours, but currently pointing at a delivery app. The highest-value fixes. */
  ourLinksGoingToApps: ReadLink[]
  /** True when every single link on the listing points at a known middleman. */
  allGoToApps: boolean
  /** Plain sentence for the top of the screen. Counted, never guessed. */
  headline: string
  /** How many buttons this service could actually change or claim. */
  fixableCount: number
}

/** The host a url points at, lowercased and without www. null when unparseable. */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** The known aggregator a url belongs to, or null. Matches on registrable suffix so
 *  a regional subdomain (order.doordash.com) still resolves. */
export function aggregatorFor(uri: string): string | null {
  const host = hostOf(uri)
  if (!host) return null
  const hit = Object.keys(AGGREGATORS).find((a) => host === a || host.endsWith('.' + a))
  return hit ? AGGREGATORS[hit] : null
}

/** Turn the raw API rows into the honest read. */
export function diagnoseOrderLinks(raw: RawActionLink[] | null | undefined): OrderLinksRead {
  const rows = Array.isArray(raw) ? raw : []
  const links: ReadLink[] = rows
    .filter((r) => typeof r.uri === 'string' && r.uri.length > 0)
    .map((r) => {
      const type = String(r.placeActionType ?? 'UNKNOWN')
      const uri = String(r.uri)
      return {
        name: typeof r.name === 'string' ? r.name : null,
        type,
        label: LABELS[type] ?? type,
        uri,
        // Google's flag is the only authority on what we may touch.
        ours: r.isEditable === true,
        goesTo: aggregatorFor(uri),
      }
    })

  const ours = links.filter((l) => l.ours)
  const locked = links.filter((l) => !l.ours)
  const filled = new Set(links.map((l) => l.type))
  const emptySlots = OWNABLE_TYPES.filter((t) => !filled.has(t.type)).map((t) => ({ type: t.type, label: t.label }))
  const ourLinksGoingToApps = ours.filter((l) => l.goesTo != null)
  const allGoToApps = links.length > 0 && links.every((l) => l.goesTo != null)
  const fixableCount = ourLinksGoingToApps.length + emptySlots.length

  return {
    ours, locked, emptySlots, ourLinksGoingToApps, allGoToApps,
    fixableCount,
    headline: headlineFor(links, ourLinksGoingToApps, emptySlots, allGoToApps),
  }
}

/** The one sentence at the top. Every number in it is counted from the rows above. */
function headlineFor(
  links: ReadLink[],
  ourAppLinks: ReadLink[],
  emptySlots: { label: string }[],
  allGoToApps: boolean,
): string {
  if (!links.length) return 'Your Google listing has no ordering or booking buttons set at all.'
  const apps = Array.from(new Set(links.map((l) => l.goesTo).filter((g): g is string => g != null)))
  if (allGoToApps && apps.length === 1) {
    return `Every ordering button on your Google listing goes to ${apps[0]}.`
  }
  if (ourAppLinks.length && emptySlots.length) {
    return `${ourAppLinks.length} of your buttons point at a delivery app, and ${emptySlots.length} are empty.`
  }
  if (ourAppLinks.length) return `${ourAppLinks.length} of your buttons point at a delivery app.`
  if (emptySlots.length) return `${emptySlots.length} of your ordering buttons are empty.`
  return 'Your ordering buttons already point at your own site.'
}

/**
 * What the owner has to supply, and whether this service can do anything for them.
 *
 * `hasOwnOrdering` must come from the owner, not the business record: the stored
 * delivery/reservation fields are self-reported and were contradicted by the live
 * listing on the first client we checked. When it is false the honest answer is that
 * there is nothing to point the button AT yet, and the next step is ordering-setup,
 * not this card.
 */
export function whatWeNeed(read: OrderLinksRead, hasOwnOrdering: boolean): {
  blocked: boolean
  reason: string | null
  nextService: string | null
  asks: { type: OwnableActionType; label: string; why: string }[]
} {
  if (!hasOwnOrdering) {
    return {
      blocked: true,
      reason: 'There is no ordering page of your own to point the button at yet.',
      nextService: 'ordering-setup',
      asks: [],
    }
  }
  const asks: { type: OwnableActionType; label: string; why: string }[] = []
  for (const s of read.emptySlots) {
    asks.push({ type: s.type, label: s.label, why: 'This button is empty, so it is yours to claim.' })
  }
  for (const l of read.ourLinksGoingToApps) {
    const t = OWNABLE_TYPES.find((o) => o.type === l.type)
    if (t) asks.push({ type: t.type, label: t.label, why: `This one goes to ${l.goesTo} today, and it is yours to change.` })
  }
  return {
    blocked: asks.length === 0,
    reason: asks.length === 0 ? 'Every button we can set already points at your own site.' : null,
    nextService: null,
    asks,
  }
}

/** A url the owner typed is only acceptable if it parses, is https, and is not itself
 *  a delivery app (pointing the Order button back at DoorDash would be the opposite of
 *  the job). Shape only — whether it RESOLVES is checked server-side. */
export function validateOwnUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Add the link to your ordering page.' }
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(withProto)
  } catch {
    return { ok: false, error: 'That does not look like a web address.' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Use an https link so guests get a secure page.' }
  if (!parsed.hostname.includes('.')) return { ok: false, error: 'That does not look like a web address.' }
  const app = aggregatorFor(parsed.toString())
  if (app) return { ok: false, error: `That is a ${app} link. This is for your own ordering page, so you keep the order.` }
  return { ok: true, url: parsed.toString() }
}
