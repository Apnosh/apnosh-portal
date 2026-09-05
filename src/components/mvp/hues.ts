/**
 * One colour per thing (portal redesign, owner 2026-09-04): every goal, stage and
 * kind has a two-stop hue, and the same hue follows that thing on every screen.
 * Chrome never takes a goal colour; chrome stays white, glass and mint.
 *
 * The goal hues are the builder's G map; the five stages keep Insights' colours.
 */
export type HueKey =
  | 'mint' | 'announce' | 'event' | 'deal' | 'nights' | 'newfaces' | 'regulars'
  | 'reviews' | 'online' | 'catering' | 'brand' | 'amber' | 'grey' | 'red'

export const HUES: Record<HueKey, [string, string]> = {
  mint: ['#4abd98', '#2e9a78'],
  announce: ['#f6a23a', '#ee4c2c'],
  event: ['#34b6ae', '#2e73b6'],
  deal: ['#c6d24f', '#5fae3e'],
  nights: ['#5ba8e8', '#3b6fd4'],
  newfaces: ['#9a5bf0', '#6a39de'],
  regulars: ['#f7c948', '#f0922f'],
  reviews: ['#8089ff', '#5b53d6'],
  online: ['#6fd06a', '#34a76a'],
  catering: ['#c85b7c', '#9c3a6a'],
  brand: ['#23c0b6', '#0f97a8'],
  amber: ['#f0b34a', '#d99a1e'],
  grey: ['#b9bfbc', '#8a928e'],
  red: ['#e0605f', '#c92d32'],
}

export const hueOf = (k?: HueKey | null): [string, string] => HUES[k ?? 'mint'] ?? HUES.mint
export const gradOf = (k?: HueKey | null, angle = 135) => { const [a, b] = hueOf(k); return `linear-gradient(${angle}deg, ${a}, ${b})` }
/** hex + alpha, for tints and shadows: tint('mint', .16) */
export const tint = (k: HueKey | null | undefined, alpha: number, stop: 0 | 1 = 0) => hueOf(k)[stop] + Math.round(alpha * 255).toString(16).padStart(2, '0')
/** the lifted-tile shadow under a gradient glyph */
export const glow = (k?: HueKey | null, alpha = 0.35) => `0 6px 14px ${tint(k, alpha, 1)}`

/** the five funnel stages, in order, with Insights' colours */
export const STAGE_HUES: HueKey[] = ['mint', 'nights', 'newfaces', 'amber', 'brand']
export const stageHue = (i: number): HueKey => STAGE_HUES[Math.max(0, Math.min(4, i))]

/** calendar kinds */
export const KIND_HUE: Record<string, HueKey> = {
  post: 'mint', shoot: 'newfaces', email: 'nights', task: 'amber', content: 'brand', launch: 'event', occasion: 'announce',
}

const GOAL_KEY_HUE: Record<string, HueKey> = {
  // CampaignDraft.goalKey
  regulars: 'regulars', 'new-customers': 'newfaces', 'slow-nights': 'nights', reviews: 'reviews',
  // PlanGoalKey
  opening: 'announce', event: 'event', 'more-new': 'newfaces', 'bigger-checks': 'deal', catering: 'catering',
  'own-takeout': 'online', 'get-known': 'brand',
  // builder goal ids
  announce: 'announce', deal: 'deal', nights: 'nights', newfaces: 'newfaces', online: 'online', brand: 'brand',
}

const WORD_HUE: [RegExp, HueKey][] = [
  [/\b(cater|caterer|catering|office|corporate)\b/i, 'catering'],
  [/\b(review|reviews|reply|replies|rating|stars?)\b/i, 'reviews'],
  [/\b(slow|tuesday|monday|wednesday|weeknight|nights?|midweek)\b/i, 'nights'],
  [/\b(deal|offer|special|discount|happy hour|bogo|coupon|promo)\b/i, 'deal'],
  [/\b(regular|regulars|loyal|loyalty|back|return|email|newsletter|sms|text)\b/i, 'regulars'],
  [/\b(order|orders|online|delivery|takeout|pickup|website|site|friction|reserve|booking)\b/i, 'online'],
  [/\b(event|party|concert|halloween|night out|festival|tasting|show|pop-?up)\b/i, 'event'],
  [/\b(opening|open|launch|new|announce|menu|dish|item|season|fall|spring|summer|winter)\b/i, 'announce'],
  [/\b(google|profile|listing|listings|maps?|found|search|visit|visits|first-?time|new faces|directions|polish|gbp)\b/i, 'newfaces'],
  [/\b(brand|name|social|instagram|tiktok|content|photo|photos|video|reel|reels|story|stories|awareness)\b/i, 'brand'],
]

/** The hue a campaign wears: its goal first, then its template, then the words in its name. */
export function campaignHue(c: { goalKey?: string | null; planGoal?: string | null; templateId?: string | null; name?: string | null }): HueKey {
  if (c.goalKey && GOAL_KEY_HUE[c.goalKey]) return GOAL_KEY_HUE[c.goalKey]
  if (c.planGoal && GOAL_KEY_HUE[c.planGoal]) return GOAL_KEY_HUE[c.planGoal]
  const words = `${c.templateId ?? ''} ${c.name ?? ''}`.replace(/[-_]/g, ' ')
  for (const [re, k] of WORD_HUE) if (re.test(words)) return k
  return 'mint'
}

/** The glyph a hue suggests (lucide names the callers map to icons). */
export const HUE_GLYPH: Record<HueKey, string> = {
  mint: 'sparkles', announce: 'megaphone', event: 'ticket', deal: 'tag', nights: 'moon', newfaces: 'map-pin', regulars: 'heart',
  reviews: 'star', online: 'shopping-cart', catering: 'users', brand: 'share-2', amber: 'clock', grey: 'file-text', red: 'alert-circle',
}
