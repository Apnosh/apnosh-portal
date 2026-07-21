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

/**
 * Where a link goes, and whether that is a problem.
 *
 * THREE buckets, not two, and the distinction is the whole point of this service:
 *
 *   'marketplace' — DoorDash, Uber Eats, Grubhub. They bring demand, take a large cut,
 *                   and own the guest. A button pointing here is the leak we are fixing.
 *   'storefront'  — Toast, Square, Chowbus, ChowNow. The restaurant's OWN ordering, just
 *                   hosted by someone. Low or flat fee, their branding, their customer.
 *                   Pointing the button here is the WIN, not a compromise.
 *   'booking'     — OpenTable, Resy, Yelp Reservations, Tock. How nearly every restaurant
 *                   takes reservations. The correct answer for the Reserve button.
 *
 * The first version of this file lumped all three together, so it would have told a
 * restaurant that its own Toast ordering page or its OpenTable link "is not your own
 * ordering page" and refused it. That is backwards: it rejects the most common right
 * answer. Being on someone else's domain does not make it a middleman.
 */
export type LinkKind = 'marketplace' | 'storefront' | 'booking'

const PROVIDERS: Record<string, { name: string; kind: LinkKind }> = {
  // Commission marketplaces. They own the guest.
  'doordash.com': { name: 'DoorDash', kind: 'marketplace' },
  'ubereats.com': { name: 'Uber Eats', kind: 'marketplace' },
  'grubhub.com': { name: 'Grubhub', kind: 'marketplace' },
  'postmates.com': { name: 'Postmates', kind: 'marketplace' },
  'seamless.com': { name: 'Seamless', kind: 'marketplace' },
  // The restaurant's own ordering, hosted. order.online is DoorDash STOREFRONT, their
  // white-label product, which is a different deal from the marketplace above: the
  // restaurant's own page and their own guest. Google also injects order.online links
  // itself, so seeing one does NOT prove the restaurant subscribes. isEditable stays the
  // only authority on what we may change; this map only names things.
  'order.online': { name: 'DoorDash Storefront', kind: 'storefront' },
  'toasttab.com': { name: 'Toast', kind: 'storefront' },
  'squareup.com': { name: 'Square', kind: 'storefront' },
  'square.site': { name: 'Square', kind: 'storefront' },
  'chowbus.com': { name: 'Chowbus', kind: 'storefront' },
  'chownow.com': { name: 'ChowNow', kind: 'storefront' },
  'slicelife.com': { name: 'Slice', kind: 'storefront' },
  'popmenu.com': { name: 'Popmenu', kind: 'storefront' },
  'spoton.com': { name: 'SpotOn', kind: 'storefront' },
  'clover.com': { name: 'Clover', kind: 'storefront' },
  'owner.com': { name: 'Owner', kind: 'storefront' },
  // Booking. Correct for Reserve a table.
  'opentable.com': { name: 'OpenTable', kind: 'booking' },
  'resy.com': { name: 'Resy', kind: 'booking' },
  'exploretock.com': { name: 'Tock', kind: 'booking' },
  'sevenrooms.com': { name: 'SevenRooms', kind: 'booking' },
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
  /** Links we cannot honestly classify without asking the owner. DoorDash Storefront
   *  (order.online) is the case: it is a white-label page that belongs to whoever pays
   *  for it, and Google also injects those links on its own. Calling it "yours" when it
   *  is not would tell an owner their ordering is fine while it leaks commission, so the
   *  ambiguity is reported instead of guessed. */
  needsOwnerCheck: ReadLink[]
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
export function providerFor(uri: string): { name: string; kind: LinkKind } | null {
  const host = hostOf(uri)
  if (!host) return null
  const hit = Object.keys(PROVIDERS).find((a) => host === a || host.endsWith('.' + a))
  if (hit) return PROVIDERS[hit]
  // Yelp is two products on one domain: /reservations is booking (a fine answer for the
  // Reserve button), everything else is just their listing page (not ordering at all).
  if (host === 'yelp.com' || host.endsWith('.yelp.com')) {
    try {
      if (new URL(uri).pathname.includes('/reservations')) return { name: 'Yelp Reservations', kind: 'booking' }
    } catch { /* fall through */ }
    return null
  }
  return null
}

/** The commission middleman a url belongs to, or null. Only 'marketplace' counts:
 *  a Toast or OpenTable link is the restaurant's own, not a leak. */
export function aggregatorFor(uri: string): string | null {
  const p = providerFor(uri)
  return p && p.kind === 'marketplace' ? p.name : null
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
  // A white-label page belongs to whoever pays for it, and we cannot tell from the url.
  const needsOwnerCheck = links.filter((l) => providerFor(l.uri)?.name === 'DoorDash Storefront')
  const allGoToApps = links.length > 0 && links.every((l) => l.goesTo != null)
  const fixableCount = ourLinksGoingToApps.length + emptySlots.length

  return {
    ours, locked, emptySlots, ourLinksGoingToApps, allGoToApps, needsOwnerCheck,
    fixableCount,
    headline: headlineFor(links, ourLinksGoingToApps, emptySlots, allGoToApps, needsOwnerCheck),
  }
}

/** The one sentence at the top. Every number in it is counted from the rows above. */
function headlineFor(
  links: ReadLink[],
  ourAppLinks: ReadLink[],
  emptySlots: { label: string }[],
  allGoToApps: boolean,
  needsOwnerCheck: ReadLink[],
): string {
  if (!links.length) return 'Your Google listing has no ordering or booking buttons set at all.'
  const apps = Array.from(new Set(links.map((l) => l.goesTo).filter((g): g is string => g != null)))
  if (allGoToApps && apps.length === 1) {
    return `Every ordering button on your Google listing goes to ${apps[0]}.`
  }
  // Every link is DoorDash-run, but some are the white-label kind we cannot attribute.
  // Say that plainly rather than picking a side we have no evidence for.
  if (needsOwnerCheck.length && links.every((l) => l.goesTo != null || needsOwnerCheck.includes(l))) {
    return 'Every ordering button on your Google listing is run by DoorDash, and some of them may not be yours.'
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
  // Only a COMMISSION marketplace is refused. A Toast, Square, Chowbus, OpenTable or
  // Resy link is the restaurant's own ordering or booking and is exactly what belongs
  // on the button. Refusing those would reject the most common correct answer.
  const p = providerFor(parsed.toString())
  if (p && p.kind === 'marketplace') {
    return { ok: false, error: `That is a ${p.name} link, and they take a cut of every order. This is for your own ordering page, so you keep it.` }
  }
  return { ok: true, url: parsed.toString() }
}

/* ── finding the owner's ordering page for them ──────────────────────────
   The business record cannot answer this: no column stores an ordering url, and the
   fields that exist were contradicted by the live listing on the first client checked.
   The WEBSITE can answer it. Reading shopyellowbee.com and shinyashokudotukwila.com
   found Shinya's real Chowbus ordering link in one request.

   So: crawl the site, PROPOSE what we found, let the owner confirm. Never write a
   guessed url. Pure and html-in so it is testable without the network. ── */

/** A link on the owner's site that looks like ordering or booking. */
export interface FoundLink {
  url: string
  /** The provider we recognise, when we do. null = looks like their own page. */
  provider: string | null
  kind: LinkKind | 'unknown'
  /** Why we think this is it, shown to the owner so the proposal is never a black box. */
  because: string
}

const ORDER_PATH = /(order|checkout|cart|shop)/i
const BOOK_PATH = /(reserv|book|table)/i

/**
 * Candidate ordering and booking links from a page's html.
 *
 * Ranks known storefront/booking providers first (a Chowbus link is a much better
 * signal than a /menu/ path), then same-site paths that look like ordering. Marketplace
 * links are returned too but marked, since "your Order button already goes to DoorDash"
 * is worth showing even though it is not the answer.
 */
export function findOrderingLinks(html: string, siteUrl: string): FoundLink[] {
  let origin: string
  try { origin = new URL(siteUrl).origin } catch { return [] }
  const hrefs = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map((m) => m[1])
  const out = new Map<string, FoundLink>()
  for (const raw of hrefs) {
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) continue
    let abs: string
    try { abs = new URL(raw, origin).toString() } catch { continue }
    // Strip the tracking noise so two links to the same page collapse into one.
    let clean: string
    try {
      const u = new URL(abs)
      for (const k of Array.from(u.searchParams.keys())) if (/^utm_|^srsltid$/i.test(k)) u.searchParams.delete(k)
      u.hash = ''
      clean = u.toString()
    } catch { clean = abs }
    if (out.has(clean)) continue

    const p = providerFor(clean)
    if (p && (p.kind === 'storefront' || p.kind === 'booking')) {
      out.set(clean, { url: clean, provider: p.name, kind: p.kind,
        because: p.kind === 'booking' ? `Your site links to ${p.name} for bookings.` : `Your site links to ${p.name} for ordering.` })
      continue
    }
    if (p && p.kind === 'marketplace') {
      out.set(clean, { url: clean, provider: p.name, kind: 'marketplace',
        because: `Your site sends people to ${p.name}, who take a cut.` })
      continue
    }
    // Same-site paths only. An unrecognised OTHER domain is not evidence of anything.
    let path: string
    try {
      const u = new URL(clean)
      if (u.origin !== origin) continue
      path = u.pathname
    } catch { continue }
    if (ORDER_PATH.test(path)) {
      out.set(clean, { url: clean, provider: null, kind: 'unknown', because: 'A page on your own site that looks like ordering.' })
    } else if (BOOK_PATH.test(path)) {
      out.set(clean, { url: clean, provider: null, kind: 'unknown', because: 'A page on your own site that looks like booking.' })
    }
  }
  // Best evidence first: real providers, then own-site guesses, marketplaces last.
  const rank = (f: FoundLink) => (f.kind === 'storefront' ? 0 : f.kind === 'booking' ? 1 : f.kind === 'unknown' ? 2 : 3)
  return Array.from(out.values()).sort((a, b) => rank(a) - rank(b)).slice(0, 12)
}

/** The single link we PROPOSE for one button, or null when we have nothing honest to
 *  offer. Never returns a marketplace link: that is the thing being fixed. */
export function proposeFor(type: OwnableActionType, found: FoundLink[]): FoundLink | null {
  const usable = found.filter((f) => f.kind !== 'marketplace')
  if (type === 'DINING_RESERVATION') {
    return usable.find((f) => f.kind === 'booking')
      ?? usable.find((f) => f.kind === 'unknown' && BOOK_PATH.test(f.url)) ?? null
  }
  return usable.find((f) => f.kind === 'storefront')
    ?? usable.find((f) => f.kind === 'unknown' && ORDER_PATH.test(f.url)) ?? null
}
