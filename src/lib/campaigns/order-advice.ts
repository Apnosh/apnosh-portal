/**
 * order-advice — the AI lane's real job on the Order button card.
 *
 * The screen already tells an owner what their buttons do. That is not enough when the
 * answer is "you have no ordering page", because the next question is one they cannot
 * answer themselves: what are my options? This turns the live read into 2 to 4 real
 * paths with the trade-offs, and names one next action.
 *
 * The grounding rule, same as the analyst: the model may only talk about facts in the
 * payload. If we did not see a DoorDash Storefront link, the "you may already have this"
 * path does not exist. If we do not know their POS, it may not assume one. An invented
 * path here costs the owner money, so the prompt says so in those words.
 *
 * The payload builder is pure and testable. The model call lives in the route.
 */

import type { OrderLinksRead } from './order-links'
import type { FoundLink } from './order-links'

export const ORDER_ADVICE_MODEL = process.env.ORDER_ADVICE_MODEL || 'claude-opus-4-8'

export interface AdvicePayload {
  business: { name: string; websiteUrl: string | null }
  /** What the buttons do today, in words the model can quote. */
  buttons: { label: string; state: 'ours-going-to-app' | 'ours-own' | 'empty' | 'locked'; goesTo: string | null }[]
  /** Providers we actually saw, so a path can point at one honestly. */
  seenProviders: string[]
  /** True only when an order.online link is on the listing. Gates the "you may already
   *  be paying for Storefront" path, which is the highest-value advice we can give and
   *  also the easiest to invent. */
  hasDoorDashStorefrontLink: boolean
  /** Ordering or booking links found on their OWN site. Empty means we found none,
   *  which is not the same as them having none. */
  foundOnSite: { url: string; provider: string | null; kind: string }[]
  /** Whether their site could be read at all. A failed crawl must not read as "no ordering". */
  siteReadable: boolean
  /** Their POS, if they ever told us. null means unknown, and the model must not guess. */
  posVendor: string | null
  /** How many buttons this service could change or claim right now. */
  fixableCount: number
}

export interface AdvicePath {
  /** Short label, e.g. "You may already have this". */
  title: string
  /** Two or three plain sentences. */
  body: string
  /** What it costs the owner, in plain words. "Free" is allowed only when it is. */
  cost: string
  /** The single thing to do to explore this path. */
  action: string
}

export interface OrderAdvice {
  /** One sentence on the situation, grounded in the counted read. */
  situation: string
  paths: AdvicePath[]
  /** The one thing to do first, and why it is first. */
  startHere: string
  /** What we would NOT do, so the advice has a shape. Optional. */
  avoid: string | null
}

/** Build the grounded payload. Pure: everything comes from the live read. */
export function buildAdvicePayload(opts: {
  businessName: string
  websiteUrl: string | null
  read: OrderLinksRead
  found: FoundLink[]
  siteReadable: boolean
  posVendor: string | null
}): AdvicePayload {
  const { read } = opts
  const buttons: AdvicePayload['buttons'] = [
    ...read.ours.map((l) => ({
      label: l.label,
      state: (l.goesTo ? 'ours-going-to-app' : 'ours-own') as 'ours-going-to-app' | 'ours-own',
      goesTo: l.goesTo,
    })),
    ...read.emptySlots.map((s) => ({ label: s.label, state: 'empty' as const, goesTo: null })),
    ...read.locked.map((l) => ({ label: l.label, state: 'locked' as const, goesTo: l.goesTo })),
  ]
  const seenProviders = Array.from(new Set([
    ...read.ours.map((l) => l.goesTo),
    ...read.locked.map((l) => l.goesTo),
    ...opts.found.map((f) => f.provider),
  ].filter((x): x is string => !!x)))

  return {
    business: { name: opts.businessName, websiteUrl: opts.websiteUrl },
    buttons,
    seenProviders,
    hasDoorDashStorefrontLink: read.needsOwnerCheck.length > 0,
    foundOnSite: opts.found.filter((f) => f.kind !== 'marketplace').map((f) => ({ url: f.url, provider: f.provider, kind: f.kind })),
    siteReadable: opts.siteReadable,
    posVendor: opts.posVendor,
    fixableCount: read.fixableCount,
  }
}

/** The payload as the prompt sees it. Kept readable so a wrong answer is debuggable. */
export function renderAdvicePrompt(p: AdvicePayload): string {
  const lines: string[] = []
  lines.push(`BUSINESS: ${p.business.name}`)
  lines.push(`WEBSITE: ${p.business.websiteUrl ?? 'none on file'}`)
  lines.push('')
  lines.push('THEIR GOOGLE BUTTONS RIGHT NOW:')
  for (const b of p.buttons) {
    const state = b.state === 'ours-going-to-app' ? `ours to change, currently goes to ${b.goesTo}`
      : b.state === 'ours-own' ? 'ours, already points at their own page'
      : b.state === 'empty' ? 'EMPTY, free to claim'
      : `locked by Google${b.goesTo ? `, goes to ${b.goesTo}` : ''}`
    lines.push(`  ${b.label}: ${state}`)
  }
  lines.push(`  Buttons we can change or claim: ${p.fixableCount}`)
  lines.push('')
  lines.push(`DOORDASH STOREFRONT LINK ON THE LISTING: ${p.hasDoorDashStorefrontLink ? 'YES' : 'no'}`)
  if (p.hasDoorDashStorefrontLink) {
    lines.push('  (order.online is DoorDash Storefront, a direct ordering page DoorDash runs')
    lines.push('   under the restaurant name, separate from the marketplace. It belongs to whoever')
    lines.push('   pays for it, and Google also injects these links itself, so we CANNOT tell from')
    lines.push('   the url whether this restaurant subscribes. That is a question for the owner.)')
  }
  lines.push('')
  lines.push('ORDERING OR BOOKING FOUND ON THEIR OWN SITE:')
  if (!p.siteReadable) lines.push('  We could not read their website, so we know nothing either way.')
  else if (!p.foundOnSite.length) lines.push('  None found on the pages we read. That is not proof they have none.')
  else for (const f of p.foundOnSite) lines.push(`  ${f.provider ?? 'their own page'} (${f.kind}): ${f.url}`)
  lines.push('')
  lines.push(`THEIR POS OR ORDERING VENDOR: ${p.posVendor ?? 'UNKNOWN, they have never told us'}`)
  lines.push(`PROVIDERS SEEN ANYWHERE: ${p.seenProviders.length ? p.seenProviders.join(', ') : 'none'}`)
  return lines.join('\n')
}

export const ADVICE_SYSTEM = `You advise independent restaurant owners on the Order and Reserve buttons on their Google listing. You write for someone who runs a kitchen, not a marketing team.

WHAT YOU ARE DOING
Their Google buttons can send a guest to a delivery marketplace that takes a cut of every order, or to the restaurant's own ordering page. You explain what their real options are, in their specific situation, and name the one thing to do first.

GROUNDING, THE HARD RULE
You may only talk about what is in the payload. You have no other knowledge of this restaurant.
- If DOORDASH STOREFRONT LINK is "no", never suggest they might already have Storefront.
- If their POS is UNKNOWN, never say "since you use Toast" or name a POS as if you knew. You may say "if you already run a POS like Toast or Square" as a conditional.
- Never state what they pay, what their order volume is, or what a platform costs them, unless it is in the payload. You do not know.
- If we could not read their website, say we do not know what is on it. Absence of evidence is not evidence of absence, and saying otherwise sends an owner to buy something they already have.
A path you invent costs this owner real money. Do not invent one.

THE THREE REAL SHAPES (use only the ones the payload supports)
1. They may already have direct ordering. Only when a DoorDash Storefront link is present, or the site crawl found a storefront provider. This is the best possible outcome, so it goes first when it applies: it may cost nothing and take five minutes to confirm.
2. Turn it on where they already are. Most restaurants with no ordering page have a POS that includes online ordering they never switched on. Cheapest real path. Conditional when the POS is unknown.
3. Add a platform built for it. Chowbus, ChowNow, Owner, Toast, Square. Flat monthly beats per-order commission at volume.

WHAT TO AVOID SAYING
Do not recommend building a custom ordering page. Payments, menu sync, tax and refunds make that a product, not a page.
Do not tell them to drop the delivery apps. Marketplaces bring reach; the point is to also give people who searched for them BY NAME a direct way to order.

VOICE
Plain words a busy person reads once. Short sentences. No marketing jargon, no "leverage", no "optimize". Never use an em dash. Do not open with a greeting. Say "you" and "your".
Numbers only if they are in the payload. Do not invent a commission percentage; you may say "a cut of every order" without a number.

OUTPUT
Return ONLY valid JSON, no prose around it:
{
  "situation": "one sentence on what is true today, from the buttons above",
  "paths": [{ "title": "short label", "body": "two or three sentences", "cost": "plain words, e.g. Free to check, or A monthly fee instead of a cut per order", "action": "the single thing to do" }],
  "startHere": "the one thing to do first and why it is first",
  "avoid": "one sentence on what you would not do, or null"
}
Two to four paths. Order them best-first for THIS restaurant.`

/** Parse + sanity-check the model's JSON. A malformed or ungrounded answer returns null
 *  so the caller can fall back to the deterministic screen rather than show nonsense. */
export function parseAdvice(raw: string, payload: AdvicePayload): OrderAdvice | null {
  let obj: unknown
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    obj = JSON.parse(m ? m[0] : raw)
  } catch { return null }
  const o = obj as Partial<OrderAdvice>
  if (!o || typeof o.situation !== 'string' || !Array.isArray(o.paths) || !o.paths.length) return null

  const paths = o.paths
    .filter((p): p is AdvicePath =>
      !!p && typeof p.title === 'string' && typeof p.body === 'string'
      && typeof p.cost === 'string' && typeof p.action === 'string'
      && p.title.trim().length > 0 && p.body.trim().length > 0)
    .slice(0, 4)
  if (!paths.length) return null

  // The one ungrounded claim that would cost real money: telling an owner they might
  // already have Storefront when no such link is on their listing. Drop that path
  // rather than trust the prompt to have held.
  const cleaned = payload.hasDoorDashStorefrontLink
    ? paths
    : paths.filter((p) => !/storefront|already have (this|it)|already pay/i.test(p.title + ' ' + p.body))
  if (!cleaned.length) return null

  const noDash = (s: string) => s.replace(/\s*—\s*/g, ', ')
  return {
    situation: noDash(o.situation.trim()),
    paths: cleaned.map((p) => ({
      title: noDash(p.title.trim()), body: noDash(p.body.trim()),
      cost: noDash(p.cost.trim()), action: noDash(p.action.trim()),
    })),
    startHere: typeof o.startHere === 'string' ? noDash(o.startHere.trim()) : '',
    avoid: typeof o.avoid === 'string' && o.avoid.trim() ? noDash(o.avoid.trim()) : null,
  }
}
