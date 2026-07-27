/**
 * service-availability — the ONE source of truth for whether a single SERVICE can be delivered today.
 *
 * catalog-availability.ts answers this for a whole store CARD ("can this be bought"). This file
 * answers it one level down, for the services a card's plan is made of ("can we actually run this
 * line"). The two are deliberately different shapes, because the honest answer is different:
 *
 *   - A CARD is an ALLOWLIST, default coming_soon. A half-finished card must never go on sale by
 *     omission, so nothing is buyable until someone signs it off.
 *   - A SERVICE is a DENYLIST, default ready. Most services are human work (menu engineering, a
 *     shoot, a monthly report) and a person can genuinely do those today. What stops a service is
 *     a missing technical RAIL, and a rail is a specific, checkable thing. So this file names only
 *     the rails we have verified are absent, and everything else is ready.
 *
 * That default cuts the right way. Defaulting every service to blocked would empty every plan and
 * would be a lie in the other direction: we can do most of this work. But it does mean this file is
 * only as good as its list, so when a rail lands, DELETE its group here in the same change.
 *
 * WHY IT EXISTS: "Fill your slow nights" is a good plan whose texts we cannot send yet. Without this
 * layer the only two moves are both bad: sell the whole plan and quietly fail on the sends, or block
 * the whole campaign and sell nothing. With it there is a third and truer move: show the whole
 * strategy, mark the parts we cannot run yet, do not bill them, and let the owner see exactly what
 * they are getting. A plan that is honest about its own holes is worth more than one that hides them.
 *
 * CLIENT-SAFE: pure data + resolvers, no server imports. Safe for the store JSX, the builder, the
 * plan screens, and the server-side ship guard, so all of them agree on one deliverable set.
 */

export type ServiceAvailability = 'ready' | 'not_yet'

export const SERVICE_AVAILABILITY_VALUES: readonly ServiceAvailability[] = ['ready', 'not_yet']

/**
 * Why a service cannot run yet, by the rail it is waiting on. Owner-facing, plain, honest.
 * Each one names the missing thing, so "not yet" is never a mystery and never sounds like a stall.
 */
export const SERVICE_NOT_YET_REASON: Record<string, string> = {
  // No ESP and no SMS gateway are wired. Email is being built (Resend); texting also needs carrier
  // registration, which takes 1 to 2 weeks on its own once the rail exists.
  send: 'We cannot send emails or texts for you yet. We are building it now.',
  // Kept for the type, but nothing is on this rail: see the note in SERVICE_BLOCKED_GROUP for why
  // paid ads came off it. Do not re-add a service here without checking its playbook first.
  ads: 'This needs your ad account connected, which we have not built yet.',
  // Nothing reads or writes the point of sale or the booking system.
  pos: 'This needs to talk to your point of sale or booking system, which we have not built yet.',
}

/**
 * Which rail each blocked service is waiting on.
 *
 * Only services whose rail we have VERIFIED is missing appear here. A service that is merely
 * uncertain is left out on purpose: this file should never grow into a guess list, because a wrong
 * "not yet" quietly deletes real revenue and a wrong "ready" quietly sells a promise we break.
 */
const SERVICE_BLOCKED_GROUP: Record<string, keyof typeof SERVICE_NOT_YET_REASON> = {
  // ── The send rail. src/lib/publish/ covers Facebook, Instagram, LinkedIn and Google posts, and
  //    nothing else. There is no ESP and no SMS gateway, so anything whose deliverable IS a message
  //    to a guest cannot run. (Both setup lines are here too: they build the rail, not a campaign.)
  'email-found': 'send',
  'sms-found': 'send',
  'welcome-seq': 'send',
  newsletter: 'send',
  'sms-program': 'send',
  'reminder-send': 'send',
  winback: 'send',
  birthday: 'send',
  'vip-comms': 'send',
  'review-engine': 'send',
  'feedback-loop': 'send',
  // Missed-call text back is a text.
  'ai-phone': 'send',

  // ── NO ADS RAIL. paid-ads used to sit here on the reasoning "no ad-account OAuth, so we cannot
  //    run or bill spend". Its own playbook contradicts that on both counts: step 1 is "Grant access
  //    to the ad accounts, OR LET US CREATE THEM" and "Confirm billing is set on the ad account
  //    (spend is paid to the platform at cost)"; step 5 is "ad spend is billed by the platform at
  //    cost, SEPARATE FROM THE FEE". We never touch the owner's spend — their card pays Meta and
  //    Google directly, and we charge a management fee for five documented steps of human work.
  //
  //    That is the difference between the rails that remain. Nobody can hand-send two thousand
  //    emails, and nothing can read a point-of-sale terminal: those are missing infrastructure. An
  //    operator logging into a Business Manager is missing LABOUR, which is what we sell. Holding it
  //    deleted the strongest lever there is for "get a line out the door on opening day".

  // ── The point-of-sale and booking rail. Nothing reads or writes either one.
  loyalty: 'pos',
  giftcards: 'pos',
  'reservation-protect': 'pos',
}

/** Can we genuinely deliver this service today? */
export function serviceAvailabilityFor(id: string): ServiceAvailability {
  return SERVICE_BLOCKED_GROUP[id] ? 'not_yet' : 'ready'
}

export function isServiceReady(id: string): boolean {
  return serviceAvailabilityFor(id) === 'ready'
}

/** The owner-facing "why not yet" line, or null when the service is ready. */
export function serviceNotYetReason(id: string): string | null {
  const group = SERVICE_BLOCKED_GROUP[id]
  return (group && SERVICE_NOT_YET_REASON[group]) || null
}

/** The rail key a service is waiting on ('send' | 'ads' | 'pos'), or null when it is ready. */
export function serviceBlockedBy(id: string): string | null {
  return SERVICE_BLOCKED_GROUP[id] ?? null
}

/**
 * Split a list of service ids into what we can run now and what is still waiting on a rail.
 * The one helper the composer, the plan screens and the ship guard share, so they cannot drift on
 * which lines are real.
 */
export function splitByReadiness(ids: readonly string[]): { ready: string[]; notYet: string[] } {
  const ready: string[] = []
  const notYet: string[] = []
  for (const id of ids) (isServiceReady(id) ? ready : notYet).push(id)
  return { ready, notYet }
}

/**
 * One plain sentence covering everything in a plan we cannot run yet, grouped by rail so the owner
 * reads one reason per missing thing instead of the same line five times. Null when nothing is
 * blocked. Used above the bill, where "what am I NOT getting" belongs.
 */
export function notYetSummary(ids: readonly string[]): string | null {
  const groups = [...new Set(ids.map(serviceBlockedBy).filter((g): g is string => !!g))]
  if (!groups.length) return null
  return groups.map((g) => SERVICE_NOT_YET_REASON[g]).filter(Boolean).join(' ')
}

/** The reason an otherwise-deliverable setup is being held back because nothing left can use it. */
export const ORPHANED_SETUP_REASON =
  'We can set this up, but everything that would use it is waiting too. We will do it when it can earn its keep.'

/**
 * Hold a setup whose only consumers are all held.
 *
 * We CAN put a guest list in one place. But in a plan where every send is waiting on the send rail,
 * that list has nowhere to go, and billing $395 for it means the owner pays now and asks "what did
 * that ever do for me" later. That is the same broken promise as selling a send we cannot deliver,
 * just slower to notice, so it gets the same treatment: keep it visible, hold it, say why.
 *
 * It comes back on its own. The day the send rail lands, its consumers stop being held, the setup
 * stops being an orphan, and it is back in the plan with no edit here.
 *
 * `deps` maps a service to the services it requires (the composer passes SEND_DEPS). Taking it as an
 * argument is what keeps this module pure data with no imports of its own.
 */
export function orphanedSetups(
  ids: readonly string[],
  deps: Record<string, readonly string[]>,
): string[] {
  const present = new Set(ids)
  const consumersOf = new Map<string, string[]>()
  for (const [consumer, required] of Object.entries(deps)) {
    if (!present.has(consumer)) continue
    for (const dep of required) {
      const list = consumersOf.get(dep) ?? []
      list.push(consumer)
      consumersOf.set(dep, list)
    }
  }
  return ids.filter((id) => {
    if (!isServiceReady(id)) return false // already held for its own reason
    const consumers = consumersOf.get(id)
    // Only a service that exists SOLELY to feed others can be orphaned. No consumers in this plan
    // means it stands on its own, so leave it alone.
    return !!consumers?.length && consumers.every((c) => !isServiceReady(c))
  })
}

/** Everything held in this plan: blocked by its own missing rail, or orphaned by the ones that are. */
export function heldServices(
  ids: readonly string[],
  deps: Record<string, readonly string[]>,
): { id: string; reason: string }[] {
  const orphans = new Set(orphanedSetups(ids, deps))
  return ids
    .map((id) => {
      const own = serviceNotYetReason(id)
      if (own) return { id, reason: own }
      if (orphans.has(id)) return { id, reason: ORPHANED_SETUP_REASON }
      return null
    })
    .filter((x): x is { id: string; reason: string } => !!x)
}
