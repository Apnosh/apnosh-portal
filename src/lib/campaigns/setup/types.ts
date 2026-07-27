/**
 * The setup-card engine — one machine, one configuration per service.
 *
 * WHY THIS EXISTS. "Polish your Google profile" works end to end, and the plan is to have nine more
 * like it. But it was built bespoke: the lane a buyer picked was a marketing sentence decoded by a
 * regex, the per-lane promises were four hand-written functions, the owner's task list was four
 * hardcoded `if (serviceId === …)` blocks, and the rollup that decides whether an owner-run campaign
 * ever reads "Done" is literally `serviceId === 'gbp-setup'`. Cloning that nine times would clone
 * every one of those, and the ninth bug fix would have to be made in nine places.
 *
 * So a card is data now, and this file is the shape of that data.
 *
 * ── THE LAW THIS MODULE EXISTS TO ENFORCE ──────────────────────────────────────────────────────
 *
 * A LANE MAY NOT PROMISE WHAT THE PLATFORM CANNOT DO.
 *
 * The get-listed card found this out the hard way, and its own comment says it plainly: "we cannot
 * read OR write any of these directories, so no owner-run lane may claim to inspect one or fix one.
 * What the free and AI lanes deliver is the right answer and the right link."
 *
 * That was true, and hand-enforced, and nothing stopped the next card from getting it wrong. Here it
 * becomes arithmetic: a card declares what its platform actually permits, a lane declares how it
 * delivers and how completion is proved, and `laneViolations()` refuses any combination the platform
 * cannot back. A "done for you" lane on a platform with no write API is not a cheaper tier — it is a
 * promise we cannot keep, and it fails the build rather than the customer.
 *
 * The consequence, and it is a feature: where there is no write path the honest product is an AI
 * GUIDE. It reads what it can, works out what is wrong, and tells the owner exactly what to change.
 * That is a real thing to sell. Selling it as "we'll handle it" is not.
 *
 * CLIENT-SAFE: types and pure resolvers only. No server imports, no I/O, no React.
 */

/** The three lanes a setup card is sold in. Matches the existing `LaneKind` minus `creator`,
 *  which never applies to setup work — nobody outsources someone else's Google profile. */
export type SetupLaneKind = 'diy' | 'ai' | 'team'

/**
 * HOW THE WORK PHYSICALLY HAPPENS. This is the field that makes the law checkable.
 *
 * It is deliberately about mechanism, not about who is nominally responsible: two lanes can both be
 * "the owner's job" and still differ on whether anything of ours ever touches the platform.
 */
export type LaneDelivery =
  /** We work out what should change and tell them precisely. Their hands do every change.
   *  The only honest shape when no write API exists for the platform. */
  | 'owner-applies'
  /** We hold a write credential and push the change ourselves. */
  | 'we-write'
  /** A person on our side works inside an account the client granted us access to. No API,
   *  real hands. Slower and more expensive than 'we-write', and honest about being manual. */
  | 'we-operate'

/**
 * HOW COMPLETION IS PROVED, best first. This is the detection ladder the master document
 * describes, as a type rather than a convention.
 *
 * The existing code already keeps verified and claimed in SEPARATE database columns
 * (`orderButtonsFixedAt` vs `orderButtonsSelfDoneAt`) and only the claimed one is writable through
 * the owner's API. That rule survives here: `owner-word` is a different rung, not a fallback that
 * quietly fills the same field.
 */
export type LaneProof =
  /** We wrote it, then read it back off the platform and it matched. The strongest thing we have. */
  | 'read-back'
  /** An independent machine check that needs no write access and no cooperation: a public DNS
   *  lookup, a page crawl, an event test-fire, data landing in a connected account. */
  | 'probe'
  /** We re-run our own diagnosis against the live platform and it comes back clean. Requires read
   *  access, and proves the end state without proving who caused it. */
  | 'reread'
  /** The owner says so. Renders as a hollow check, never a solid one. */
  | 'owner-word'

/** What the platform behind a card actually permits us to do. The honest floor for every promise. */
export interface PlatformAccess {
  /** Can we read the live state through an API we hold? */
  canRead: boolean
  /** Can we write changes through an API we hold? */
  canWrite: boolean
  /** Is there an independent check that needs neither, e.g. a public DNS lookup or a site crawl? */
  hasProbe?: boolean
  /** Plain sentence naming the limit, shown to the owner wherever a lane is missing or hollow.
   *  Required when anything is false, because "we cannot" without "why" reads as evasion. */
  limitation?: string
}

/** The owner-facing task a lane puts on the readiness screen, if it puts one there at all. */
export interface LaneOwnerTask {
  title: string
  why: string
  /** Where the button goes. Inward to our own walkthrough, or outward to the platform. */
  href: string
  actionLabel: string
  /**
   * The execution field a SERVER route stamps once it has verified the work itself.
   * Never in the owner's PATCH whitelist — that is what makes it unforgeable.
   */
  verifiedField?: string
  /**
   * The execution field the OWNER stamps by pressing "I did this". Owner-writable by design.
   * A lane whose proof is `owner-word` must have this and must not have `verifiedField`.
   */
  claimedField?: string
}

export interface LanePrice {
  amount: number
  kind: 'one-time' | 'monthly'
}

export interface SetupLane {
  kind: SetupLaneKind
  /** What the picker says. The old system decoded these strings; nothing decodes them now. */
  label: string
  delivery: LaneDelivery
  proof: LaneProof
  /** Absent means free. */
  price?: LanePrice
  /** Included for Pro subscribers rather than sold separately. */
  proOnly?: boolean
  /** The "what you get" rows for THIS lane. Every lane must describe what that lane truly does. */
  whatYouGet: string[]
  /** What the owner has to bring for this lane specifically, shown before purchase. */
  requires?: string[]
  ownerTask?: LaneOwnerTask
}

export interface SetupCard {
  /** The store card id (`gbp`, `friction`, …). */
  id: string
  /** The catalog service this card composes to. */
  serviceId: string
  /** What the platform lets us do. Every lane below is checked against it. */
  platform: PlatformAccess
  lanes: SetupLane[]
}

/* ── the law, as arithmetic ─────────────────────────────────────────────────────────────────── */

/** What each proof rung requires of the platform. */
function proofIsBacked(proof: LaneProof, p: PlatformAccess): boolean {
  switch (proof) {
    case 'read-back': return p.canWrite && p.canRead
    case 'reread': return p.canRead
    case 'probe': return p.hasProbe === true
    case 'owner-word': return true
  }
}

/** What each delivery mechanism requires of the platform. */
function deliveryIsPossible(delivery: LaneDelivery, p: PlatformAccess): boolean {
  switch (delivery) {
    case 'we-write': return p.canWrite
    // Both of these are humans clicking. Always physically possible; the question is only who.
    case 'owner-applies':
    case 'we-operate': return true
  }
}

/**
 * Every way a card lies, listed. Empty means the card only promises what it can do.
 *
 * Returned rather than thrown so the sim can report all of them at once, and so an admin editor
 * could eventually show them inline while someone is authoring a card.
 */
export function laneViolations(card: SetupCard): string[] {
  const out: string[] = []
  const p = card.platform

  if ((!p.canRead || !p.canWrite) && !p.limitation) {
    out.push(`${card.id}: platform has a limit but does not say what it is`)
  }

  for (const lane of card.lanes) {
    const at = `${card.id}/${lane.kind}`

    if (!deliveryIsPossible(lane.delivery, p)) {
      out.push(`${at}: delivers by "${lane.delivery}" but we hold no write access to this platform`)
    }
    if (!proofIsBacked(lane.proof, p)) {
      out.push(`${at}: claims proof "${lane.proof}" the platform cannot back`)
    }
    /* The separation the execution columns already enforce, pulled forward to authoring time. */
    if (lane.proof === 'owner-word' && lane.ownerTask?.verifiedField) {
      out.push(`${at}: proof is the owner's word but it stamps a verified field`)
    }
    if (lane.proof !== 'owner-word' && lane.ownerTask?.claimedField && !lane.ownerTask.verifiedField) {
      out.push(`${at}: claims a real proof but only ever stamps a self-reported field`)
    }
    /* A lane the owner runs has to tell them where to go and do it. */
    if (lane.delivery === 'owner-applies' && !lane.ownerTask) {
      out.push(`${at}: the owner does the work but the lane gives them nowhere to do it`)
    }
    if (!lane.whatYouGet.length) {
      out.push(`${at}: promises nothing`)
    }
  }

  const kinds = card.lanes.map((l) => l.kind)
  if (new Set(kinds).size !== kinds.length) out.push(`${card.id}: the same lane twice`)

  return out
}

/** True when a card can honestly offer a done-for-you lane at all. */
export const canBeDoneForYou = (p: PlatformAccess): boolean => p.canWrite

/** The rows the product page shows for a chosen lane. */
export function whatYouGetFor(card: SetupCard, kind: SetupLaneKind): string[] {
  return card.lanes.find((l) => l.kind === kind)?.whatYouGet ?? []
}

export const laneOf = (card: SetupCard, kind: SetupLaneKind): SetupLane | undefined =>
  card.lanes.find((l) => l.kind === kind)
