/**
 * Adapter: turns the new campaign builder's output (a catalog item id + the
 * owner's filled slot values) into a real CampaignDraft, reusing the existing
 * composeCampaign engine so the saved campaign has priced line items, a brief,
 * and a budget — no backend or schema change.
 *
 * Each catalog item has a bespoke plan here (its content beats + goal), so every
 * one of the ~28 items saves a distinct, tailored campaign. The owner's exact
 * slot choices are preserved in brief.spec so the team sees what they asked for.
 */

import type { CampaignTemplate, CampaignCategory, ContentBeatSpec } from '../data/campaign-templates'
import type { CampaignDraft, GoalKey, BuildPath, LineItem } from '../types'
import { composeCampaign } from '../campaign-composer'
import { summarize } from '../types'
import { serviceById, serviceToLine } from '../catalog'

type Goal = 'acquire' | 'capacity' | 'retain' | 'reviews'
type Dur = 'ongoing' | 'once' | 'short' | 'setup'
type Beat = [type: 'reel' | 'photo' | 'post' | 'story' | 'email' | 'sms', channel: string, label: string]

interface ItemPlan {
  title: string
  goal: Goal
  dur: Dur
  beats: Beat[]
  /** add a local-ads line (paid-ads service) to the plan */
  ads?: boolean
  /** override default audience ids */
  audiences?: string[]
  /** priced-catalog service ids to add as line items (website / SEO / GBP work) */
  services?: string[]
}

const GOAL_META: Record<Goal, { goalKey: GoalKey; category: CampaignCategory; kpi: string; objective: string; audiences: string[] }> = {
  acquire: { goalKey: 'new-customers', category: 'demand', kpi: 'new guests from the campaign', objective: 'Bring in new guests', audiences: ['everyone'] },
  capacity: { goalKey: 'slow-nights', category: 'capacity', kpi: 'covers on your slow shifts', objective: 'Fill your slower shifts', audiences: ['everyone'] },
  retain: { goalKey: 'regulars', category: 'retain', kpi: 'repeat visits per month', objective: 'Bring guests back more often', audiences: ['regulars', 'firsttimers'] },
  reviews: { goalKey: 'reviews', category: 'reputation', kpi: 'fresh reviews and a higher rating', objective: 'Grow your reviews and rating', audiences: ['everyone'] },
}
const DUR_WEEKS: Record<Dur, number | null> = { ongoing: null, once: 1, short: 3, setup: 2 }

/* Per-catalog-item plans (bespoke). Keys match the builder's CATALOG ids. */
const PLANS: Record<string, ItemPlan> = {
  // Plans (ongoing, multi-channel)
  reach: { title: 'Reach new locals', goal: 'acquire', dur: 'ongoing', ads: true, beats: [['reel', 'reels', 'Local discovery reel'], ['post', 'gbp', 'Google post to nearby searchers']] },
  nights: { title: 'Fill your slow nights', goal: 'capacity', dur: 'ongoing', beats: [['post', 'social', 'Slow-night offer post'], ['sms', 'sms', 'Day-before text to regulars'], ['email', 'email', 'Slow-night email']] },
  firstvisit: { title: 'Win first-time visits', goal: 'acquire', dur: 'ongoing', ads: true, beats: [['reel', 'reels', 'First-visit reel'], ['post', 'social', 'Offer post']] },
  regulars: { title: 'Turn first-timers into regulars', goal: 'retain', dur: 'ongoing', beats: [['email', 'email', 'Come-back reward email'], ['sms', 'sms', 'Thank-you text']] },
  catering: { title: 'Catering and big orders', goal: 'acquire', dur: 'ongoing', beats: [['post', 'social', 'Catering post'], ['email', 'email', 'Catering outreach email']] },
  reviewsplan: { title: 'Boost reviews and rating', goal: 'reviews', dur: 'ongoing', beats: [['post', 'social', 'Review-ask post'], ['email', 'email', 'Follow-up review request']] },

  // Content (one-off pieces)
  reel: { title: 'A short video', goal: 'acquire', dur: 'once', beats: [['reel', 'reels', 'Short-form reel']] },
  story: { title: 'A story', goal: 'acquire', dur: 'once', beats: [['story', 'social', 'Instagram story']] },
  carousel: { title: 'A carousel post', goal: 'acquire', dur: 'once', beats: [['post', 'social', 'Carousel post']] },
  graphic: { title: 'A designed graphic', goal: 'acquire', dur: 'once', beats: [['post', 'social', 'Designed graphic']] },
  dish: { title: 'Feature a dish', goal: 'acquire', dur: 'once', beats: [['photo', 'social', 'Styled dish photo'], ['post', 'social', 'Feature post']] },
  gpost: { title: 'A Google Business post', goal: 'acquire', dur: 'once', beats: [['post', 'gbp', 'Google Business post']] },
  promoevent: { title: 'Promote an event', goal: 'acquire', dur: 'short', beats: [['reel', 'reels', 'Event teaser reel'], ['post', 'social', 'Event post'], ['email', 'email', 'Event invite email']] },
  launch: { title: 'Launch a special', goal: 'acquire', dur: 'short', beats: [['reel', 'reels', 'Launch reel'], ['post', 'social', 'Launch post'], ['story', 'social', 'Launch-day story']] },
  creator: { title: 'Work with a creator', goal: 'acquire', dur: 'short', beats: [['reel', 'reels', 'Creator collab reel'], ['post', 'social', 'Repost + caption']] },

  // Email / SMS
  welcome: { title: 'Welcome new subscribers', goal: 'retain', dur: 'ongoing', beats: [['email', 'email', 'Welcome email']] },
  second: { title: 'Nudge a second visit', goal: 'retain', dur: 'ongoing', beats: [['email', 'email', 'Come-back email'], ['sms', 'sms', 'Come-back text']] },
  news: { title: 'Monthly newsletter', goal: 'retain', dur: 'ongoing', beats: [['email', 'email', 'Monthly newsletter']] },
  slowoffer: { title: 'Slow-night offer', goal: 'capacity', dur: 'ongoing', beats: [['email', 'email', 'Slow-night email'], ['sms', 'sms', 'Slow-night text']] },
  birthday: { title: 'Birthday treat', goal: 'retain', dur: 'ongoing', beats: [['email', 'email', 'Birthday email'], ['sms', 'sms', 'Birthday text']] },
  earlyaccess: { title: 'Early access for regulars', goal: 'retain', dur: 'once', beats: [['email', 'email', 'Early-access email']] },

  // Tasks / setup
  shoot: { title: 'Photo & video shoot', goal: 'acquire', dur: 'setup', beats: [['photo', 'social', 'Photo + video shoot'], ['reel', 'reels', 'Reel from the shoot']] },
  gbp: { title: 'Google Business Profile', goal: 'reviews', dur: 'setup', services: ['gbp-setup'], beats: [['post', 'gbp', 'Profile refresh + Google post']] },

  // Web & SEO (priced services, real "stuff we can do")
  website: { title: 'Website build & tune-up', goal: 'acquire', dur: 'setup', services: ['site-menu'], beats: [] },
  seo: { title: 'Local SEO', goal: 'acquire', dur: 'ongoing', services: ['local-seo'], beats: [['post', 'gbp', 'Local SEO content & citations']] },
  reviewsreply: { title: 'Reply to reviews', goal: 'reviews', dur: 'ongoing', beats: [['post', 'social', 'Drafted review replies']] },
  qr: { title: 'Add a table QR', goal: 'retain', dur: 'setup', beats: [['post', 'social', 'QR table card design']] },
  friction: { title: 'Smooth out ordering', goal: 'acquire', dur: 'setup', beats: [['post', 'social', 'Order-now post + links']] },
  giftcard: { title: 'Push gift cards', goal: 'acquire', dur: 'short', beats: [['post', 'social', 'Gift-card post'], ['email', 'email', 'Gift-card email']] },
  ticket: { title: 'Run a ticketed event', goal: 'acquire', dur: 'short', beats: [['post', 'social', 'Ticketed-event post'], ['email', 'email', 'Event invite email']] },

  // Automation
  winback: { title: 'Win back quiet guests', goal: 'retain', dur: 'ongoing', audiences: ['lapsed'], beats: [['email', 'email', 'We-miss-you email'], ['sms', 'sms', 'Win-back text']] },
}

function fallbackPlan(): ItemPlan {
  return { title: 'New campaign', goal: 'acquire', dur: 'once', beats: [['post', 'social', 'A post']] }
}

/** Serialize the builder's slot values into a flat spec (stored in brief.spec)
 *  and surface the keys composeCampaign reads (offer, feature). The free-text
 *  audience slot is renamed so it can't blank out the template audiences. */
function specFromVals(vals: Record<string, unknown>): Record<string, string> {
  const spec: Record<string, string> = {}
  for (const [k, v] of Object.entries(vals || {})) {
    if (v == null || v === '') continue
    let str: string
    if (Array.isArray(v)) str = v.join(', ')
    else if (v instanceof Date) str = v.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    else if (typeof v === 'object') str = JSON.stringify(v)
    else str = String(v)
    if (!str.trim()) continue
    spec[k === 'audience' ? 'audienceChoice' : k] = str
  }
  const offer = spec.offer || spec.special || spec.reward || spec.treat || spec.deal
  if (offer) spec.offer = offer
  const feature = spec.subject || spec.menu || spec.headline
  if (feature) spec.feature = feature
  return spec
}

export interface BuilderInput { itemId: string; status: string; vals: Record<string, unknown> }

/** Build a real CampaignDraft from the builder output. */
export function draftFromBuilder({ itemId, vals }: BuilderInput): CampaignDraft {
  const plan = PLANS[itemId] || fallbackPlan()
  const meta = GOAL_META[plan.goal]
  const spec = specFromVals(vals)

  const contentPlan: ContentBeatSpec[] = plan.beats.map(([type, channel, label], i) => ({ week: i + 1, type, channel, label }))
  const channels = Array.from(new Set([...plan.beats.map(([, ch]) => ch), ...(plan.ads ? ['ads'] : [])]))

  const objective = spec.offer ? `${meta.objective} with ${spec.offer}` : meta.objective

  const tpl: CampaignTemplate = {
    id: `builder-${itemId}`,
    icon: '✨',
    name: plan.title,
    tagline: '',
    category: meta.category,
    goalKey: meta.goalKey,
    objective,
    kpi: meta.kpi,
    durationWeeks: DUR_WEEKS[plan.dur],
    suggestedOffers: [],
    defaultAudienceIds: plan.audiences ?? meta.audiences,
    defaultChannelIds: channels,
    contentPlan,
    projected: '',
    questions: [],
  }

  const composed = composeCampaign(tpl, spec)

  // Append any priced-catalog services this plan calls for (website / SEO / GBP),
  // so the saved campaign carries real, billable work — not just content beats.
  const serviceLines: LineItem[] = (plan.services ?? [])
    .map((sid, i) => { const s = serviceById(sid); return s ? serviceToLine(s, `li-s-${sid}-${i}`) : null })
    .filter((l): l is LineItem => l !== null)
  const items = [...composed.items, ...serviceLines]

  const bill = summarize(items)
  const path: BuildPath = 'strategist'  // owner approves, Apnosh builds

  return {
    id: 'new',
    name: composed.name,
    intent: tpl.durationWeeks === null ? 'ongoing' : 'one-off',
    path,
    phase: 'review',
    budgetMonthly: bill.perMonth,
    items,
    planned: true,
    goalKey: meta.goalKey,
    targetDate: spec.date || undefined,
    context: spec.days || spec.shift || spec.audienceChoice || undefined,
    brief: composed.brief,
  }
}
