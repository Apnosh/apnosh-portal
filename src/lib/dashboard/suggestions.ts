/**
 * Home suggestion cards — the ranked "stack" the owner sees at the top of Home
 * (Robinhood-style). PURE module: no Supabase / server imports, so both the
 * client transform (instant, from already-loaded data) and the server API
 * route (richer facts + an AI rewrite pass) can share it.
 *
 * The server gathers live FACTS; this file turns facts into ranked, plain,
 * owner-facing cards grounded in those facts. The AI pass (in the API route)
 * only selects + rewords these candidates by id and never invents links, so a
 * card's action is always real.
 */

export type SuggestionAccent = 'amber' | 'green' | 'blue' | 'coral' | 'violet'

export interface Suggestion {
  id: string
  /** tiny uppercase label, e.g. "DO THIS NEXT", "GOOD NEWS" */
  eyebrow: string
  title: string
  body: string
  accent: SuggestionAccent
  /** icon key resolved to a lucide icon in the component */
  icon: string
  cta?: string
  href?: string
  /** ranking weight; not rendered */
  priority: number
  /** A genuine "needs you" item (waiting approval, a low review, a dropped
   *  connection) rather than a soft tip. Obligation cards can't be dismissed
   *  and always show, so Home never hides something real or falsely claims
   *  "all caught up". They clear themselves once the owner acts. */
  obligation?: boolean
}

export interface SuggestionFacts {
  approvalsCount?: number
  tasksCount?: number
  /** primary metric this week vs last */
  metric?: { label: string; weekPct: number; monthPct: number } | null
  reviews?: { unanswered: number; lowest?: { author: string; rating: number } | null }
  connections?: { broken?: string[]; missingSocial?: boolean }
  plan?: { label: string; daysLabel: string; hook: string } | null
  /** The nearest few upcoming moments worth a post. Preferred over `plan`. */
  plans?: { label: string; daysLabel: string; hook: string }[]
  /** Marketing quick-wins derived from the live planning signals (listing gaps,
   *  review themes). Code supplies the facts + the real fix link; the AI pass
   *  only rewords. */
  quickWins?: {
    listingFix?: { channel: string; gap: string }
    feature?: string
    fixTheme?: string
  }
  /** True when the account already has a shipped campaign running. When set, the generic
   *  "plan a post / start a campaign" nudges step down so they don't lead — the team is already
   *  producing content, so real maintenance wins + dated moments come first. */
  hasActiveCampaigns?: boolean
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Build every applicable candidate card from the facts, ranked most-important
 * first. Does NOT label the lead — call markLead() after you've capped to the
 * cards you'll actually show (and after any AI reordering).
 */
export function buildCandidates(f: SuggestionFacts): Suggestion[] {
  const out: Suggestion[] = []

  for (const p of f.connections?.broken ?? []) {
    out.push({ id: `reconnect-${slug(p)}`, eyebrow: 'NEEDS A FIX', accent: 'amber', icon: 'plug', priority: 100, obligation: true,
      title: `Reconnect ${cap(p)}`, body: `Your ${cap(p)} connection dropped. Reconnect to keep your posts and data flowing.`,
      cta: 'Reconnect', href: '/dashboard/connected-accounts' })
  }
  if (f.reviews?.lowest && f.reviews.lowest.rating <= 3) {
    const r = f.reviews.lowest
    out.push({ id: 'review-low', eyebrow: 'WORTH A REPLY', accent: 'coral', icon: 'star', priority: 95, obligation: true,
      title: `Reply to ${r.author}`, body: `They left ${r.rating} stars. A quick, kind reply shows future guests you care.`,
      cta: 'Reply', href: '/dashboard/inbox?tab=reviews' })
  }
  if ((f.approvalsCount ?? 0) > 0) {
    const n = f.approvalsCount!
    out.push({ id: 'approvals', eyebrow: 'NEEDS YOUR OK', accent: 'amber', icon: 'sparkles', priority: 90, obligation: true,
      title: 'Review what is waiting', body: `${n} ${n === 1 ? 'thing is' : 'things are'} ready for your OK before they go live.`,
      cta: 'Review', href: '/dashboard/inbox?tab=approvals' })
  }
  if (f.quickWins?.listingFix) {
    const { channel, gap } = f.quickWins.listingFix
    out.push({ id: 'fix-listing', eyebrow: 'QUICK WIN', accent: 'amber', icon: 'mapPin', priority: 64,
      title: `Tidy up your ${channel} listing`, body: `${gap}. A two minute fix so guests find the right info.`,
      cta: 'Fix it', href: '/dashboard/insights/listing' })
  }
  if (f.quickWins?.fixTheme) {
    out.push({ id: 'fix-theme', eyebrow: 'WORTH A LOOK', accent: 'coral', icon: 'message', priority: 58,
      title: `Guests keep mentioning ${f.quickWins.fixTheme}`, body: 'It comes up in your reviews. Worth a look before it costs you stars.',
      cta: 'See reviews', href: '/dashboard/inbox?tab=reviews' })
  }
  if (f.quickWins?.feature) {
    out.push({ id: 'feature-strength', eyebrow: 'QUICK WIN', accent: 'green', icon: 'sparkles', priority: f.hasActiveCampaigns ? 18 : 49,
      title: `Show off your ${f.quickWins.feature}`, body: 'Guests keep praising it. A quick post puts it in front of more of them.',
      cta: 'Plan a post', href: '/dashboard/campaigns/new' })
  }
  if (f.metric && f.metric.weekPct < 0) {
    const m = f.metric
    out.push({ id: `metric-down-${slug(m.label)}`, eyebrow: 'HEADS UP', accent: 'coral', icon: 'trendingDown', priority: f.hasActiveCampaigns ? 26 : 62,
      title: `${cap(m.label)} dipped ${Math.abs(m.weekPct)}% this week`, body: 'A fresh post usually brings it back up within a few days.',
      cta: 'Plan a post', href: '/dashboard/campaigns/new' })
  }
  if ((f.reviews?.unanswered ?? 0) > 0) {
    const n = f.reviews!.unanswered
    out.push({ id: 'reviews', eyebrow: 'WORTH A REPLY', accent: 'blue', icon: 'message', priority: 60,
      title: `${n} ${n === 1 ? 'guest is' : 'guests are'} waiting on you`, body: 'Replying to your reviews lifts how high you show up on Google.',
      cta: 'Reply now', href: '/dashboard/inbox?tab=reviews' })
  }
  if ((f.tasksCount ?? 0) > 0) {
    const n = f.tasksCount!
    out.push({ id: 'tasks', eyebrow: 'A FEW UPDATES', accent: 'violet', icon: 'bell', priority: 52,
      title: `${n} ${n === 1 ? 'update needs' : 'updates need'} a look`, body: 'Small things are waiting for you. None are urgent.',
      cta: 'See all', href: '/dashboard/inbox?tab=todos' })
  }
  const planMoments = (f.plans && f.plans.length ? f.plans : (f.plan ? [f.plan] : [])).slice(0, 3)
  planMoments.forEach((p, i) => {
    out.push({ id: `plan-${slug(p.label)}`, eyebrow: 'WORTH PLANNING', accent: 'violet', icon: 'calendar', priority: 50 - i,
      title: `${p.label} is ${p.daysLabel.toLowerCase()}`, body: p.hook, cta: 'Plan it', href: '/dashboard/campaigns/new' })
  })
  if (f.connections?.missingSocial) {
    out.push({ id: 'connect-instagram', eyebrow: 'OPPORTUNITY', accent: 'green', icon: 'plus', priority: 46,
      title: 'Connect Instagram', body: 'Link it once and we start reaching nearby guests for you.',
      cta: 'Connect', href: '/dashboard/connected-accounts' })
  }
  if (f.metric && f.metric.weekPct > 8) {
    const m = f.metric
    out.push({ id: `metric-up-${slug(m.label)}`, eyebrow: 'GOOD NEWS', accent: 'green', icon: 'trendingUp', priority: 30,
      title: `${cap(m.label)} up ${m.weekPct}% this week`, body: 'Your recent posts are landing. Worth keeping the momentum.',
      cta: 'See what is working', href: '/dashboard/insights' })
  }

  out.sort((a, b) => b.priority - a.priority)
  return out
}

/** Label the first actionable card "DO THIS NEXT" so exactly one card reads as
 *  the next step. Call after capping/AI-reordering. Returns the same list. */
export function markLead(list: Suggestion[]): Suggestion[] {
  const lead = list.find((s) => s.href)
  if (lead) lead.eyebrow = 'DO THIS NEXT'
  return list
}
