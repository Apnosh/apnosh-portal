/**
 * How each card type presents: tone (mint = win, gray = everything else)
 * and the one action it carries. Shared by the API, the deck, and the
 * archive so a type looks the same everywhere.
 */

export type ProofTone = 'win' | 'heads_up'
export interface ProofCta { label: string; href: string }

export const STATE_TYPES = ['steady', 'coming_up', 'reviews_waiting', 'approval_waiting', 'complaint_watch', 'start_campaign', 'connect_google', 'google_paused', 'google_quiet'] as const
export type StateType = typeof STATE_TYPES[number]
export type EventType = 'gbp_week' | 'post' | 'reviews' | 'gbp_down'
export type AnyCardType = EventType | StateType

export function presentCardType(type: string): { tone: ProofTone; cta?: ProofCta } {
  switch (type) {
    case 'gbp_week': case 'post': case 'reviews': return { tone: 'win' }
    case 'gbp_down': return { tone: 'heads_up', cta: { label: 'Plan the push', href: '/campaigns/new' } }
    case 'steady': return { tone: 'heads_up' }
    case 'coming_up': return { tone: 'heads_up', cta: { label: 'See what is coming', href: '/dashboard/campaigns' } }
    case 'reviews_waiting': return { tone: 'heads_up', cta: { label: 'Reply now', href: '/dashboard/inbox' } }
    case 'start_campaign': return { tone: 'heads_up', cta: { label: 'Start a campaign', href: '/campaigns/new' } }
    case 'connect_google': return { tone: 'heads_up', cta: { label: 'Connect Google', href: '/dashboard/connected-accounts' } }
    case 'google_paused': return { tone: 'heads_up', cta: { label: 'Reconnect Google', href: '/dashboard/connected-accounts' } }
    case 'google_quiet': return { tone: 'heads_up', cta: { label: 'Polish your listing', href: '/dashboard/google-profile' } }
    case 'approval_waiting': return { tone: 'heads_up', cta: { label: 'Review it', href: '/dashboard/inbox' } }
    case 'complaint_watch': return { tone: 'heads_up', cta: { label: 'Read the reviews', href: '/dashboard/inbox' } }
    default: return { tone: 'heads_up' }
  }
}
