/**
 * Campaign templates — the concrete restaurant playbooks that replace the old
 * abstract goal picker. Each one carries a strategy: the objective, the
 * offers worth running, who to target, where it runs, and the cadence of
 * content that ships. Picking one gets the owner 80% of the way; a short
 * template-aware spec fills the rest. This is what makes a campaign land
 * instead of just "spend money to be seen."
 */
import type { GoalKey } from '@/lib/campaigns/types'

/* ── Shared option sets ───────────────────────────────────────────────── */

/** Who a campaign targets. Existing-guest audiences map to a Guest segment. */
export interface AudienceOption { id: string; label: string; icon: string; channels: string[]; segmentId?: string; sub: string }
export const AUDIENCES: Record<string, AudienceOption> = {
  'new-locals': { id: 'new-locals', label: 'New locals nearby', icon: '🧭', channels: ['reels', 'ads', 'gbp'], sub: 'People in your area who’ve never been in' },
  lapsed: { id: 'lapsed', label: 'Lapsed regulars', icon: '🌙', channels: ['sms', 'email'], segmentId: 'lapsed', sub: 'Haven’t been back in 60+ days' },
  regulars: { id: 'regulars', label: 'Your regulars', icon: '💛', channels: ['sms', 'email'], segmentId: 'regulars', sub: 'Your most loyal guests' },
  firsttimers: { id: 'firsttimers', label: 'Recent first-timers', icon: '✨', channels: ['email', 'sms'], segmentId: 'new', sub: 'Came once in the last month' },
  vips: { id: 'vips', label: 'VIPs', icon: '👑', channels: ['email', 'sms'], segmentId: 'vip', sub: 'Top guests by spend' },
  families: { id: 'families', label: 'Families', icon: '👨‍👩‍👧', channels: ['reels', 'ads', 'social'], sub: 'Family-friendly diners nearby' },
  datenight: { id: 'datenight', label: 'Date-night crowd', icon: '🍷', channels: ['reels', 'ads', 'social'], sub: 'Couples looking for a night out' },
  // Catering buyers (B2B) — drive who a catering campaign targets.
  offices: { id: 'offices', label: 'Nearby offices', icon: '🏢', channels: ['email', 'social', 'ads'], sub: 'Companies and teams that order catering' },
  planners: { id: 'planners', label: 'Event planners', icon: '🗓️', channels: ['email', 'social'], sub: 'People who book food for events' },
  schools: { id: 'schools', label: 'Schools & groups', icon: '🎓', channels: ['email', 'social', 'ads'], sub: 'Schools, teams, and big groups nearby' },
  'past-orders': { id: 'past-orders', label: 'Past big orders', icon: '📦', channels: ['email', 'social'], sub: 'Guests who ordered catering before' },
  everyone: { id: 'everyone', label: 'Everyone', icon: '🌍', channels: ['reels', 'email', 'gbp', 'social'], sub: 'All your guests + new locals' },
}

/** Where a campaign runs. */
export interface ChannelOption { id: string; label: string; icon: string; serviceId?: string }
export const CHANNELS: Record<string, ChannelOption> = {
  reels: { id: 'reels', label: 'Short-form video', icon: '🎬', serviceId: 'video-engine' },
  social: { id: 'social', label: 'Social posts', icon: '📸', serviceId: 'social-mgmt' },
  gbp: { id: 'gbp', label: 'Google', icon: '🔍', serviceId: 'gbp-posts' },
  email: { id: 'email', label: 'Email', icon: '✉️', serviceId: 'welcome-seq' },
  sms: { id: 'sms', label: 'Text', icon: '💬', serviceId: 'sms-program' },
  ads: { id: 'ads', label: 'Local ads', icon: '📣', serviceId: 'paid-ads' },
  instore: { id: 'instore', label: 'In-store', icon: '🏠' },
}

export interface OfferOption { id: string; label: string; note?: string }

/** A template-aware spec question. */
export interface SpecQuestion {
  id: string
  prompt: string
  kind: 'chips' | 'offer' | 'audience' | 'text' | 'date'
  options?: { label: string; value: string }[]
  /** Allow a free-text answer in addition to chips. */
  allowText?: boolean
  /** Optional questions can be skipped. */
  optional?: boolean
  placeholder?: string
}

export interface ContentBeatSpec { week: number; type: string; label: string; channel: string; boost?: boolean; because?: string; serviceId?: string }

export type CampaignCategory = 'demand' | 'capacity' | 'retain' | 'reputation'
export const CATEGORY_META: Record<CampaignCategory, { label: string }> = {
  demand: { label: 'Bring people in' },
  capacity: { label: 'Fill your tables' },
  retain: { label: 'Keep them coming back' },
  reputation: { label: 'Look your best' },
}

export interface CampaignTemplate {
  id: string
  icon: string
  name: string
  tagline: string
  category: CampaignCategory
  /** Drives the always-on service engine for supporting work. */
  goalKey: GoalKey
  objective: string
  kpi: string
  /** Time-boxed length, or null for an ongoing program. */
  durationWeeks: number | null
  suggestedOffers: OfferOption[]
  /** Default targeting if the owner doesn't change it. */
  defaultAudienceIds: string[]
  defaultChannelIds: string[]
  /** The content cadence — turned into a real calendar by the composer. */
  contentPlan: ContentBeatSpec[]
  /** A plain projected-outcome line. */
  projected: string
  questions: SpecQuestion[]
}

/* ── The templates ────────────────────────────────────────────────────── */

const SHIFT_OPTS = [
  { label: 'Mon–Tue', value: 'Monday & Tuesday' }, { label: 'Midweek', value: 'midweek' },
  { label: 'Lunch', value: 'the lunch shift' }, { label: 'Sundays', value: 'Sundays' }, { label: 'Off-season', value: 'the off-season' },
]
const NIGHT_OPTS = [
  { label: 'Monday', value: 'Mondays' }, { label: 'Tuesday', value: 'Tuesdays' }, { label: 'Wednesday', value: 'Wednesdays' },
  { label: 'Thursday', value: 'Thursdays' }, { label: 'Sunday', value: 'Sundays' },
]

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'fill-shifts', icon: '🌙', name: 'Fill slow shifts', tagline: 'Drive covers on your quiet days', category: 'capacity',
    goalKey: 'slow-nights', objective: 'Fill your quiet shifts', kpi: 'covers on slow shifts', durationWeeks: 4,
    suggestedOffers: [
      { id: 'happy', label: 'Happy hour deal', note: '½-price apps + drink specials' },
      { id: 'prixfixe', label: 'Weeknight prix-fixe', note: '3 courses, one price' },
      { id: 'kids', label: 'Kids eat free' },
      { id: 'twofer', label: '2-for-1 on a signature' },
    ],
    defaultAudienceIds: ['lapsed', 'new-locals'], defaultChannelIds: ['sms', 'reels', 'gbp', 'ads'],
    contentPlan: [
      { week: 1, type: 'reel', label: 'Launch reel — the offer in 12 seconds', channel: 'Instagram · TikTok' },
      { week: 1, type: 'sms', label: 'Kickoff text to lapsed guests', channel: 'SMS' },
      { week: 1, type: 'post', label: 'Google post — the weekly deal', channel: 'Google' },
      { week: 2, type: 'sms', label: 'Weekly reminder text', channel: 'SMS' },
      { week: 2, type: 'reel', label: 'Crowd / food reel', channel: 'Instagram' },
      { week: 3, type: 'sms', label: 'Weekly reminder text', channel: 'SMS' },
      { week: 4, type: 'sms', label: 'Last-call text', channel: 'SMS' },
    ],
    projected: '~+15–20 covers per slow shift',
    questions: [
      { id: 'shift', prompt: 'Which shifts are slowest?', kind: 'chips', options: SHIFT_OPTS, allowText: true },
      { id: 'offer', prompt: 'What pulls them in?', kind: 'offer' },
      { id: 'audience', prompt: 'Who should we reach?', kind: 'audience' },
      { id: 'feature', prompt: 'Anything to show off? (a dish, your drinks…)', kind: 'text', optional: true, placeholder: 'e.g. our margaritas & tacos' },
    ],
  },
  {
    id: 'new-menu', icon: '🍔', name: 'Launch something new', tagline: 'A new dish, menu, patio or hours', category: 'demand',
    goalKey: 'new-customers', objective: 'Get people in to try what’s new', kpi: 'trial of the new item', durationWeeks: 3,
    suggestedOffers: [
      { id: 'firsttaste', label: 'First taste 20% off' },
      { id: 'freeside', label: 'Free side with it' },
      { id: 'limited', label: 'Limited time only', note: 'urgency, no discount' },
      { id: 'showoff', label: 'Just show it off', note: 'no offer' },
    ],
    defaultAudienceIds: ['regulars', 'new-locals'], defaultChannelIds: ['reels', 'email', 'social', 'gbp'],
    contentPlan: [
      { week: 1, type: 'reel', label: 'Teaser reel — the new item, up close', channel: 'Instagram · TikTok' },
      { week: 1, type: 'email', label: 'Announcement email to your list', channel: 'Email' },
      { week: 1, type: 'photo', label: 'Hero photo set', channel: 'Instagram · Google' },
      { week: 2, type: 'story', label: 'Behind-the-scenes story', channel: 'Instagram Story' },
      { week: 2, type: 'reel', label: 'Guest-reaction reel', channel: 'Instagram' },
      { week: 3, type: 'post', label: 'Now-on-the-menu post', channel: 'Instagram · Facebook' },
    ],
    projected: '~hundreds of new reach + first orders',
    questions: [
      { id: 'what', prompt: 'What are you launching?', kind: 'text', placeholder: 'e.g. our new summer burger' },
      { id: 'when', prompt: 'When does it go live?', kind: 'date', optional: true },
      { id: 'offer', prompt: 'A hook to get the first taste?', kind: 'offer' },
      { id: 'audience', prompt: 'Who hears about it first?', kind: 'audience' },
    ],
  },
  {
    id: 'event', icon: '🗓', name: 'Promote an event or date', tagline: 'A holiday, special night or one-off', category: 'demand',
    goalKey: 'new-customers', objective: 'Pack the date', kpi: 'reservations & covers for the date', durationWeeks: 2,
    suggestedOffers: [
      { id: 'prixfixe', label: 'Special prix-fixe menu' },
      { id: 'reserve', label: 'Reserve-now bonus', note: 'free drink with booking' },
      { id: 'gift', label: 'Gift with the visit' },
      { id: 'none', label: 'No offer — just the invite', note: 'no offer' },
    ],
    defaultAudienceIds: ['regulars', 'vips', 'new-locals'], defaultChannelIds: ['email', 'sms', 'reels', 'gbp'],
    contentPlan: [
      { week: 1, type: 'email', label: 'Save-the-date / invite email', channel: 'Email' },
      { week: 1, type: 'reel', label: 'Teaser reel for the event', channel: 'Instagram · TikTok' },
      { week: 1, type: 'post', label: 'Google event post', channel: 'Google' },
      { week: 2, type: 'sms', label: 'Reminder text — book now', channel: 'SMS' },
      { week: 2, type: 'story', label: 'Day-of countdown story', channel: 'Instagram Story' },
    ],
    projected: '~a full book for the date',
    questions: [
      { id: 'what', prompt: 'What’s the occasion?', kind: 'text', placeholder: 'e.g. Father’s Day brunch' },
      { id: 'when', prompt: 'What date?', kind: 'date' },
      { id: 'offer', prompt: 'A reason to book now?', kind: 'offer' },
      { id: 'audience', prompt: 'Who should get the invite?', kind: 'audience' },
    ],
  },
  {
    id: 'recurring-night', icon: '🎉', name: 'Start a recurring night', tagline: 'Taco Tuesday, trivia, live music…', category: 'capacity',
    goalKey: 'slow-nights', objective: 'Build a weekly habit', kpi: 'covers on the night, week over week', durationWeeks: null,
    suggestedOffers: [
      { id: 'theme', label: 'Themed food + drink deal' },
      { id: 'trivia', label: 'Trivia / game night' },
      { id: 'music', label: 'Live music' },
      { id: 'special', label: 'A special menu just for that night' },
    ],
    defaultAudienceIds: ['regulars', 'new-locals', 'families'], defaultChannelIds: ['sms', 'reels', 'social', 'gbp'],
    contentPlan: [
      { week: 1, type: 'reel', label: 'Launch reel — introduce the night', channel: 'Instagram · TikTok' },
      { week: 1, type: 'post', label: 'Recurring Google + social post', channel: 'Google · Facebook' },
      { week: 2, type: 'sms', label: 'Weekly “tonight!” text', channel: 'SMS' },
      { week: 2, type: 'photo', label: 'Weekly recap photo', channel: 'Instagram' },
    ],
    projected: '~a reliably busier night within a month',
    questions: [
      { id: 'night', prompt: 'Which night?', kind: 'chips', options: NIGHT_OPTS, allowText: true },
      { id: 'offer', prompt: 'What’s the theme or draw?', kind: 'offer' },
      { id: 'audience', prompt: 'Who should we rally?', kind: 'audience' },
    ],
  },
  {
    id: 'winback', icon: '💝', name: 'Win back lapsed guests', tagline: 'Bring back the ones who drifted', category: 'retain',
    goalKey: 'regulars', objective: 'Bring lapsed guests back through the door', kpi: 'returning guests', durationWeeks: 2,
    suggestedOffers: [
      { id: 'miss', label: 'We-miss-you 20% off' },
      { id: 'free', label: 'Free dish on your return' },
      { id: 'bonus', label: 'Comeback bonus / loyalty points' },
    ],
    defaultAudienceIds: ['lapsed'], defaultChannelIds: ['sms', 'email'],
    contentPlan: [
      { week: 1, type: 'email', label: 'We-miss-you email with the offer', channel: 'Email' },
      { week: 1, type: 'sms', label: 'Win-back text', channel: 'SMS' },
      { week: 2, type: 'sms', label: 'Last-chance reminder', channel: 'SMS' },
    ],
    projected: '~12% of lapsed guests back in',
    questions: [
      { id: 'offer', prompt: 'What brings them back?', kind: 'offer' },
      { id: 'feature', prompt: 'Remind them what they love? (optional)', kind: 'text', optional: true, placeholder: 'e.g. your famous brunch' },
    ],
  },
  {
    id: 'regulars', icon: '🔁', name: 'Turn first-timers into regulars', tagline: 'Win the all-important 2nd visit', category: 'retain',
    goalKey: 'regulars', objective: 'Turn recent first-timers into repeat guests', kpi: 'second visits', durationWeeks: null,
    suggestedOffers: [
      { id: 'second', label: 'A reason to come back this week' },
      { id: 'loyalty', label: 'Loyalty sign-up perk' },
      { id: 'nexttime', label: 'Free item next time' },
    ],
    defaultAudienceIds: ['firsttimers'], defaultChannelIds: ['email', 'sms'],
    contentPlan: [
      { week: 1, type: 'email', label: 'Warm welcome email', channel: 'Email' },
      { week: 1, type: 'sms', label: '2nd-visit nudge text', channel: 'SMS' },
      { week: 2, type: 'email', label: 'Loyalty invite', channel: 'Email' },
    ],
    projected: '~1 in 5 first-timers become regulars',
    questions: [
      { id: 'offer', prompt: 'What earns the 2nd visit?', kind: 'offer' },
      { id: 'feature', prompt: 'A signature to highlight? (optional)', kind: 'text', optional: true, placeholder: 'e.g. our weekend pastries' },
    ],
  },
  {
    id: 'discover', icon: '📣', name: 'Get discovered by new locals', tagline: 'Be found by people who’ve never been', category: 'demand',
    goalKey: 'new-customers', objective: 'Put yourself in front of nearby diners', kpi: 'new guests & reach', durationWeeks: null,
    suggestedOffers: [
      { id: 'firstvisit', label: 'First-visit deal' },
      { id: 'signature', label: 'Showcase your signature', note: 'no discount' },
      { id: 'none', label: 'No offer', note: 'pure awareness' },
    ],
    defaultAudienceIds: ['new-locals'], defaultChannelIds: ['reels', 'gbp', 'ads', 'social'],
    contentPlan: [
      { week: 1, type: 'reel', label: 'Signature-dish reel', channel: 'Instagram · TikTok' },
      { week: 1, type: 'post', label: 'Google post + local SEO', channel: 'Google' },
      { week: 2, type: 'reel', label: 'Atmosphere / story reel', channel: 'Instagram' },
      { week: 2, type: 'photo', label: 'Fresh photo set for listings', channel: 'Google · Yelp' },
    ],
    projected: '~thousands of new local reach / month',
    questions: [
      { id: 'audience', prompt: 'Any crowd in particular?', kind: 'audience' },
      { id: 'feature', prompt: 'What should we show off?', kind: 'text', placeholder: 'e.g. our wood-fired pizzas' },
      { id: 'offer', prompt: 'A first-visit hook? (optional)', kind: 'offer', optional: true },
    ],
  },
  {
    id: 'reviews', icon: '⭐', name: 'Boost reviews & rating', tagline: 'More fresh reviews, a higher star', category: 'reputation',
    goalKey: 'reviews', objective: 'Grow fresh reviews and lift your rating', kpi: 'new reviews & average rating', durationWeeks: 4,
    suggestedOffers: [
      { id: 'ask', label: 'Just ask, nicely', note: 'no incentive' },
      { id: 'thanks', label: 'Small thank-you for feedback' },
    ],
    defaultAudienceIds: ['regulars', 'firsttimers'], defaultChannelIds: ['sms', 'email', 'instore'],
    contentPlan: [
      { week: 1, type: 'sms', label: 'Post-visit review-request text', channel: 'SMS' },
      { week: 1, type: 'email', label: 'Review-request email', channel: 'Email' },
      { week: 2, type: 'post', label: 'In-store QR + table card', channel: 'In-store' },
    ],
    projected: '~+0.2★ and dozens of fresh reviews',
    questions: [
      { id: 'where', prompt: 'Where do you most need reviews?', kind: 'chips', options: [{ label: 'Google', value: 'Google' }, { label: 'Yelp', value: 'Yelp' }, { label: 'Both', value: 'Google & Yelp' }] },
      { id: 'audience', prompt: 'Ask which guests?', kind: 'audience' },
    ],
  },
]

export const TEMPLATE_BY_ID = Object.fromEntries(CAMPAIGN_TEMPLATES.map(t => [t.id, t]))
