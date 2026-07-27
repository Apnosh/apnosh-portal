/**
 * THE REQUIREMENTS LIBRARY — every distinct thing we need from a restaurant, defined once.
 *
 * THE PROMISE THIS EXISTS TO KEEP: collect once, forever. A client who connected Google to buy the
 * profile card should find it already green when they buy the order-buttons card. The intake for a
 * five-campaign plan should be the UNION of what those five need, deduplicated — one form, one
 * signing session, one connect screen — not five intakes back to back.
 *
 * Today that promise is not kept, because there is no shared vocabulary for "a thing we need". Each
 * card asks for what it wants in its own words, in its own screen, and nothing knows that two of
 * them asked for the same connection. With four cards that is survivable. With ten it is the single
 * worst thing about the product.
 *
 * ── TWO IDEAS, KEPT APART ──────────────────────────────────────────────────────────────────────
 *
 * HOW IT IS COLLECTED (`method`) and HOW WE KNOW IT IS TRUE (`proof`) are different questions, and
 * conflating them is how "connected" comes to mean "somebody clicked a button once". A client can
 * complete an OAuth flow and still have granted us nothing usable; the flow is the method, the API
 * answering is the proof.
 *
 * The proof rungs deliberately reuse the words the setup engine already uses for lane completion.
 * `probe` and `owner-word` mean the same thing in both files, because they are the same thing, and
 * a second ladder with different names for the same rungs is how two halves of one product start
 * disagreeing about what "done" means.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────────────────────────
 *
 * Anything resting on the owner's word renders as a HOLLOW check, never a solid one. That is not a
 * cosmetic choice: the whole trust model is that a green tick means we looked. `requirementFlaws()`
 * refuses a definition that claims a proof its method cannot produce, the same way `laneViolations`
 * does for lanes.
 *
 * CLIENT-SAFE: pure data and resolvers. No server imports, no I/O.
 */

/** The twelve ways anything gets collected. Every requirement uses exactly one. */
export type CollectionMethod =
  /** Pre-filled from what we already hold; one tap to confirm or correct. */
  | 'confirm'
  /** Pick from a fixed list. */
  | 'choice'
  /** A short typed value. */
  | 'text'
  /** A structured, resumable form. */
  | 'form'
  /** A file: a menu, a photo set, a costs sheet. */
  | 'upload'
  /** An OAuth button. The token is the point. */
  | 'connect'
  /** A guided add-us-as-a-user flow. Never a password. */
  | 'invite'
  /** A deep link to do one thing elsewhere. */
  | 'link'
  /** An e-signature. */
  | 'sign'
  /** A booked call, only where a human genuinely is the product. */
  | 'call'
  /** Nobody is asked. The system checks. */
  | 'detect'
  /** Another campaign's artifact has to exist first. */
  | 'prereq'

/**
 * How we know a requirement is satisfied, best first.
 *
 * `probe` and `owner-word` are the same rungs the setup lanes use, by design.
 */
export type RequirementProof =
  /** We hold a live credential and the API answers. The strongest thing available. */
  | 'token'
  /** An independent machine check needing no credential: a DNS lookup, a crawl, a test fire. */
  | 'probe'
  /** We tried to use the access ourselves and it worked. Weaker than a token, stronger than a claim. */
  | 'our-side'
  /** The owner says so. Renders hollow. */
  | 'owner-word'

export interface Requirement {
  /** Stable key. This is what the vault stores against, so it never changes once shipped. */
  id: string
  /** What it is, in the owner's words. */
  label: string
  method: CollectionMethod
  proof: RequirementProof
  /** What "done" means, concretely enough to implement a checker from. */
  doneWhen: string
  /**
   * True when this is a one-time fact about the business rather than an access grant.
   * Facts can go stale and want re-confirming; grants get revoked and want re-probing.
   */
  fact?: boolean
  /** Another requirement that must be satisfied first. */
  needs?: string
}

/* ── the library ─────────────────────────────────────────────────────────────────────────────────
 * Grouped by what they are, because that is how an intake screen wants to render them: all the
 * connections together, all the facts together, one signing session at the end. */

/** Access we hold, or are granted. */
const ACCESS: Requirement[] = [
  { id: 'GOOGLE', label: 'Your Google Business Profile', method: 'connect', proof: 'token',
    doneWhen: 'The Google API returns your profile. You stay the owner.' },
  { id: 'GBP-MGR', label: 'Manager access for us on Google', method: 'invite', proof: 'our-side',
    doneWhen: 'Our access pings green.', needs: 'GOOGLE' },
  { id: 'META', label: 'Facebook page and Instagram', method: 'invite', proof: 'token',
    doneWhen: 'The partner link and the Instagram account type both read back from the API.' },
  { id: 'MSG-ACC', label: 'Message access turned on', method: 'link', proof: 'token',
    doneWhen: 'The API can read your inbox.', needs: 'META' },
  { id: 'DELIV', label: 'Your delivery dashboards', method: 'invite', proof: 'our-side',
    doneWhen: 'We can sign in. There is no API for these, so a person confirms.' },
  { id: 'POS', label: 'Your point of sale', method: 'connect', proof: 'probe',
    doneWhen: 'Transactions are landing.' },
  { id: 'SITE', label: 'Your website admin', method: 'invite', proof: 'our-side',
    doneWhen: 'Our sign-in succeeds.' },
  { id: 'DNS', label: 'Your domain records', method: 'call', proof: 'probe',
    doneWhen: 'A public DNS lookup returns the records. Automatic either way you set them.' },
  { id: 'ESP', label: 'Your email platform', method: 'connect', proof: 'token',
    doneWhen: 'The API answers.' },
  { id: 'ADACC', label: 'Your ad account', method: 'invite', proof: 'token',
    doneWhen: 'Partner access and a payment method both read back from the API.' },
]

/** Facts about the business. Pre-filled wherever we can, so most are one tap. */
const FACTS: Requirement[] = [
  { id: 'NAP', label: 'Your name, address and phone', method: 'confirm', proof: 'owner-word', fact: true,
    doneWhen: 'One tap. This becomes the single truth every listing is corrected against.' },
  { id: 'HOURS', label: 'Your hours, including holidays', method: 'confirm', proof: 'owner-word', fact: true,
    doneWhen: 'Saved, and we ask again each season about holidays.' },
  { id: 'ATTR', label: 'Parking, patio, and the rest', method: 'choice', proof: 'owner-word', fact: true,
    doneWhen: 'Every attribute Google offers your kind of place is answered yes or no.' },
  { id: 'MENU', label: 'Your menu and prices', method: 'upload', proof: 'owner-word', fact: true,
    doneWhen: 'Parsed, and you confirm the items we read.' },
  { id: 'DISH', label: 'What is in each dish', method: 'form', proof: 'owner-word', fact: true,
    doneWhen: 'Every item on the menu has its detail filled in.', needs: 'MENU' },
  { id: 'COSTS', label: 'What each plate costs you', method: 'upload', proof: 'owner-word', fact: true,
    doneWhen: 'Present for the items we are pricing against. Missing means we do not design an offer.', needs: 'MENU' },
  { id: 'PHOTOS', label: 'Thirty or more usable photos', method: 'upload', proof: 'probe',
    doneWhen: 'The count and the resolution both pass a check.' },
  { id: 'PRPHOTO', label: 'Photos at print resolution', method: 'upload', proof: 'probe',
    doneWhen: 'A resolution check passes. Phone files are refused, with the reason.' },
  { id: 'LINKS', label: 'Your booking and ordering links', method: 'text', proof: 'probe',
    doneWhen: 'We fetch both. They resolve, or it is not done.' },
  { id: 'COMPS', label: 'Three places you respect, one you do not', method: 'text', proof: 'owner-word', fact: true,
    doneWhen: 'Four places named, each one findable on Google.' },
]

/** What the owner wants, which nothing can be inferred from. */
const INTENT: Requirement[] = [
  { id: 'GOAL', label: 'What you are actually after', method: 'choice', proof: 'owner-word', fact: true,
    doneWhen: 'Saved to the plan.' },
  { id: 'BUDGET', label: 'An honest monthly number', method: 'text', proof: 'owner-word', fact: true,
    doneWhen: 'Saved to the plan.' },
  { id: 'WIN', label: 'What counts as a win', method: 'choice', proof: 'owner-word', fact: true,
    doneWhen: 'Saved, and it configures what we track.' },
  { id: 'TIME', label: 'Time you can really give it each week', method: 'choice', proof: 'owner-word', fact: true,
    doneWhen: 'Saved. This is the answer that decides which option will not collapse in week six.' },
  { id: 'OFFER', label: 'The offer we may promote', method: 'choice', proof: 'owner-word', fact: true,
    doneWhen: 'One offer picked, with what it costs you and when it stops.' },
  { id: 'CONSENT', label: 'Proof your list opted in', method: 'upload', proof: 'owner-word',
    doneWhen: 'Present, per segment. A segment with none is never texted.' },
]

/** Things a person does, or signs. */
const HUMAN: Requirement[] = [
  { id: 'VOICE', label: 'How you sound', method: 'prereq', proof: 'our-side',
    doneWhen: 'A voice guide exists in your vault, from a worksheet, a session or an interview.' },
  { id: 'MEMO', label: 'What is on this month', method: 'form', proof: 'owner-word',
    doneWhen: 'Submitted this cycle. Five minutes, and we nudge on day two.' },
  { id: 'IVIEW', label: 'A conversation with us', method: 'call', proof: 'our-side',
    doneWhen: 'The call happened and the thing it was for was delivered.' },
  { id: 'STORYQ', label: 'Whether you have a story worth pitching', method: 'form', proof: 'our-side',
    doneWhen: 'A person read it. No story, no sale.' },
  { id: 'AGREE', label: 'The paperwork', method: 'sign', proof: 'our-side',
    doneWhen: 'Signed. Everything for a plan is bundled into one session.' },
  { id: 'ESCAL', label: 'What we may do without asking', method: 'sign', proof: 'our-side',
    doneWhen: 'Signed, and it says which replies we send without you seeing them first.' },
  { id: 'DATE', label: 'The date it happens', method: 'form', proof: 'owner-word', fact: true,
    doneWhen: 'A date is locked. Under six weeks out routes to a conversation instead.' },
]

export const REQUIREMENTS: readonly Requirement[] = [...ACCESS, ...FACTS, ...INTENT, ...HUMAN]

export const requirementById = (id: string): Requirement | undefined =>
  REQUIREMENTS.find((r) => r.id === id)

/* ── the rules ───────────────────────────────────────────────────────────────────────────────── */

/** Which methods can actually produce which proof. The honesty check, same shape as lanes. */
function proofIsReachable(r: Requirement): boolean {
  switch (r.proof) {
    // Only a real credential flow yields a token.
    case 'token': return r.method === 'connect' || r.method === 'invite' || r.method === 'link'
    // A machine check needs something to check: a file, a value, a connection, or nothing at all.
    case 'probe': return ['upload', 'text', 'connect', 'detect', 'call', 'link'].includes(r.method)
    // We tried it ourselves.
    case 'our-side': return ['invite', 'sign', 'call', 'form', 'prereq'].includes(r.method)
    case 'owner-word': return true
  }
}

/** Everything wrong with the library. Empty means every requirement can prove what it claims. */
export function requirementFlaws(): string[] {
  const out: string[] = []
  const ids = new Set<string>()
  for (const r of REQUIREMENTS) {
    if (ids.has(r.id)) out.push(`${r.id}: defined twice`)
    ids.add(r.id)
    if (!proofIsReachable(r)) out.push(`${r.id}: collected by "${r.method}" but claims proof "${r.proof}"`)
    if (r.doneWhen.length < 12) out.push(`${r.id}: "done when" is too vague to implement`)
    if (r.doneWhen.includes('—')) out.push(`${r.id}: em dash in owner-facing copy`)
  }
  for (const r of REQUIREMENTS) {
    if (r.needs && !ids.has(r.needs)) out.push(`${r.id}: needs ${r.needs}, which does not exist`)
    if (r.needs === r.id) out.push(`${r.id}: needs itself`)
  }
  return out
}

/** True when a satisfied requirement should still render as a hollow check. */
export const isHollow = (r: Requirement): boolean => r.proof === 'owner-word'

/**
 * The intake for a whole plan: the union of what every card needs, deduplicated, with prerequisites
 * pulled in and ordered before the things that need them.
 *
 * This is the function that makes "collect once" real. Five cards that all want Google produce one
 * Google row, and a card that wants manager access drags the connection in ahead of it whether or
 * not anything else asked.
 */
export function intakeFor(required: readonly string[]): Requirement[] {
  const want = new Set<string>()

  const pull = (id: string, seen: Set<string>) => {
    if (want.has(id) || seen.has(id)) return
    seen.add(id)
    const r = requirementById(id)
    if (!r) return
    if (r.needs) pull(r.needs, seen)
    want.add(id)
  }
  for (const id of required) pull(id, new Set())

  // Library order, which already groups access, facts, intent and human work.
  return REQUIREMENTS.filter((r) => want.has(r.id))
}

/** What is still missing, given what the vault already holds. */
export function missingFrom(required: readonly string[], held: readonly string[]): Requirement[] {
  const have = new Set(held)
  return intakeFor(required).filter((r) => !have.has(r.id))
}
