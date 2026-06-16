/**
 * Mock onboarding profiles — the shape real Supabase-backed onboarding data
 * would take. Swapping this module for a real fetch is the only change
 * needed to go live; everything downstream reads BusinessProfile.
 */
import type { BusinessProfile, GoalKey } from '@/lib/campaigns/types'

/** Plain-language goals the owner picks from — the real input. */
export const GOALS: Record<GoalKey, { label: string; short: string; icon: string; blurb: string }> = {
  'new-customers': { label: 'Get more new customers', short: 'get more new customers', icon: '📣', blurb: 'Be found by people who’ve never been in.' },
  regulars:        { label: 'Turn visitors into regulars', short: 'turn visitors into regulars', icon: '💛', blurb: 'Bring first-timers back, again and again.' },
  'slow-nights':   { label: 'Fill the slow nights', short: 'fill the slow nights', icon: '🌙', blurb: 'Drive covers on your quiet days.' },
  reviews:         { label: 'Fix our reviews & rating', short: 'fix our reviews & rating', icon: '⭐', blurb: 'More fresh reviews and a higher rating.' },
}
export const GOAL_ORDER: GoalKey[] = ['new-customers', 'regulars', 'slow-nights', 'reviews']

export const PROFILES: BusinessProfile[] = [
  {
    id: 'bella', name: 'Bella’s Café', archetype: 'Café / bakery', archetypeIcon: '☕',
    goal: 'Turn first-time visitors into regulars', goalKey: 'regulars',
    has: ['A customer list', 'Someone posting on social'], peerSpend: 800,
  },
  {
    id: 'lumiere', name: 'Lumière', archetype: 'Fine dining', archetypeIcon: '🍷',
    goal: 'Bring in more new diners', goalKey: 'new-customers',
    has: ['A good website'], peerSpend: 1800,
  },
  {
    id: 'taphouse', name: 'The Tap House', archetype: 'Bar / nightlife', archetypeIcon: '🍸',
    goal: 'Fill the slow weeknights', goalKey: 'slow-nights',
    has: ['A customer list'], peerSpend: 1200,
  },
  {
    id: 'corner', name: 'Corner Slice', archetype: 'QSR / fast-casual', archetypeIcon: '🍕',
    goal: 'Fix our reviews & rating', goalKey: 'reviews',
    has: [], peerSpend: 600,
  },
]

export const DEFAULT_PROFILE = PROFILES[0]
