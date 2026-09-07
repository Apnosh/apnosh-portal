/**
 * How each card type presents: tone (mint = win, gray = everything else)
 * and the one action it carries. Shared by the API, the deck, and the
 * archive so a type looks the same everywhere.
 *
 * A stored card's `metadata` can be handed in as well. Only the counted-promise card reads it,
 * and only to point its action at the ORDER the number came from instead of the whole list.
 */

export type ProofTone = 'win' | 'heads_up'
export interface ProofCta { label: string; href: string }

export const STATE_TYPES = ['steady', 'coming_up', 'reviews_waiting', 'approval_waiting', 'complaint_watch', 'start_campaign', 'connect_google', 'google_paused', 'google_quiet', 'setup_waiting', 'connect_social', 'connect_site', 'reviews_none', 'occasion_soon'] as const
export type StateType = typeof STATE_TYPES[number]
export type EventType = 'gbp_week' | 'post' | 'reviews' | 'gbp_down' | 'campaign_moved' | 'social_month' | 'site_week' | 'promise_counted'
export type AnyCardType = EventType | StateType

/** Anything that could be a row id. Checked before it is put in a link, never trusted raw. */
const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Where "See results" goes for a counted promise: the order it was counted on.
 *
 * The composer stores campaignId and requestId on the card (src/app/api/cron/count-is-in), the
 * same two the "your count is in" notice links to. Sending the owner to the whole campaigns list
 * and asking them to find the one the number came from is a step nobody should have to take. A
 * card with neither (or with anything that is not a row id on it) keeps the list.
 */
function countedHref(metadata: unknown): string {
  const m = metadata as { campaignId?: unknown; requestId?: unknown } | null
  const campaign = m?.campaignId
  if (typeof campaign === 'string' && ROW_ID.test(campaign)) return `/dashboard/campaigns/${campaign}`
  const request = m?.requestId
  if (typeof request === 'string' && ROW_ID.test(request)) return `/dashboard/requests/${request}`
  return '/dashboard/campaigns'
}

export function presentCardType(type: string, metadata?: unknown): { tone: ProofTone; cta?: ProofCta } {
  switch (type) {
    case 'gbp_week': case 'post': case 'reviews': case 'social_month': case 'site_week': return { tone: 'win' }
    // The count on an order the owner bought. Mint like the rest, and the ONLY type the wins
    // shelf and the share link accept (src/lib/love/win.ts). Its action is the order it came
    // from, which is where the number is explained.
    case 'promise_counted': return { tone: 'win', cta: { label: 'See results', href: countedHref(metadata) } }
    case 'campaign_moved': return { tone: 'win', cta: { label: 'See the campaign', href: '/dashboard/campaigns' } }
    case 'gbp_down': return { tone: 'heads_up', cta: { label: 'Plan the push', href: '/campaigns/new' } }
    case 'steady': return { tone: 'heads_up' }
    case 'coming_up': return { tone: 'heads_up', cta: { label: 'See what is coming', href: '/dashboard/campaigns' } }
    case 'reviews_waiting': return { tone: 'heads_up', cta: { label: 'Reply now', href: '/dashboard/inbox' } }
    case 'start_campaign': return { tone: 'heads_up', cta: { label: 'Start a campaign', href: '/campaigns/new' } }
    case 'connect_google': return { tone: 'heads_up', cta: { label: 'Connect Google', href: '/dashboard/connected-accounts' } }
    case 'google_paused': return { tone: 'heads_up', cta: { label: 'Reconnect Google', href: '/dashboard/connected-accounts' } }
    case 'google_quiet': return { tone: 'heads_up', cta: { label: 'Polish your listing', href: '/dashboard/google-profile' } }
    case 'setup_waiting': return { tone: 'heads_up', cta: { label: 'Finish setup', href: '/dashboard/campaigns' } }
    case 'connect_social': return { tone: 'heads_up', cta: { label: 'Connect', href: '/dashboard/connected-accounts' } }
    case 'connect_site': return { tone: 'heads_up', cta: { label: 'Connect', href: '/dashboard/connected-accounts' } }
    case 'reviews_none': return { tone: 'heads_up', cta: { label: 'See your listing', href: '/dashboard/google-profile' } }
    case 'occasion_soon': return { tone: 'heads_up', cta: { label: 'Make something', href: '/dashboard/design/order' } }
    case 'approval_waiting': return { tone: 'heads_up', cta: { label: 'Review it', href: '/dashboard/inbox' } }
    case 'complaint_watch': return { tone: 'heads_up', cta: { label: 'Read the reviews', href: '/dashboard/inbox' } }
    default: return { tone: 'heads_up' }
  }
}
