// All onboarding step data — chip options, role definitions, etc.

export const ROLES: Array<{ id: string; emoji: string; title: string; desc: string; disabled?: boolean }> = [
  { id: 'owner', emoji: '🏢', title: 'Business owner', desc: 'I own or co-own this business' },
  { id: 'manager', emoji: '👔', title: 'Manager', desc: 'I manage this business or its marketing' },
  { id: 'employee', emoji: '💻', title: 'Employee', desc: 'I work here and handle our marketing' },
  { id: 'agency', emoji: '🤝', title: 'Agency / consultant', desc: 'I manage marketing on behalf of someone else' },
  { id: 'freelancer', emoji: '⚡', title: 'Freelancer', desc: 'I work with multiple clients', disabled: true },
]

export const BIZ_TYPES = [
  'Restaurant / café / bar',
  'Retail store',
  'Salon / spa / beauty',
  'Fitness / gym / wellness',
  'Professional services',
  'Healthcare / medical',
  'Real estate',
  'Home services',
  'Entertainment / events',
  'Other',
] as const

export const FOOD_BIZ_TYPES = ['Restaurant / café / bar'] as const

export const CUISINES = [
  'American', 'Asian Fusion', 'Chinese', 'Japanese', 'Korean', 'Vietnamese',
  'Thai', 'Indian', 'Mexican', 'Italian', 'Mediterranean', 'French',
  'Middle Eastern', 'Caribbean', 'Soul / Southern', 'Seafood',
  'BBQ / Smokehouse', 'Vegan / Vegetarian', 'Bakery / Desserts', 'Other',
] as const

export const SERVICE_STYLES = [
  'Fast food', 'Quick service / fast casual', 'Casual dining', 'Family style',
  'Fine dining', 'Café / coffee shop', 'Bar / lounge', 'Buffet / AYCE',
  'Food truck / pop-up', 'Catering', 'Bakery / patisserie', 'Other',
] as const

// Price point — matches client_profiles.price_range CHECK ('$'..'$$$$')
export const PRICE_TIERS = [
  { id: '$', title: '$', desc: 'Budget-friendly · under $15 a head' },
  { id: '$$', title: '$$', desc: 'Casual · $15–30 a head' },
  { id: '$$$', title: '$$$', desc: 'Upscale · $30–60 a head' },
  { id: '$$$$', title: '$$$$', desc: 'Fine dining · $60+ a head' },
] as const

// Dietary accommodations the kitchen can offer
export const DIETARY_CHIPS = [
  'Vegan', 'Vegetarian', 'Gluten-free', 'Halal', 'Kosher',
  'Nut-free', 'Dairy-free', 'Keto / low-carb', 'Organic / local',
  'Allergen-friendly',
] as const

// Customer age range — matches client_profiles.customer_age_range
export const AGE_RANGES = [
  'Mostly under 25', 'Mostly 25–34', 'Mostly 35–44',
  'Mostly 45–54', 'Mostly 55+', 'All ages',
] as const

// Emoji usage — matches client_profiles.emoji_usage CHECK
export const EMOJI_LEVELS = [
  { id: 'heavy', title: 'Lots of emojis', desc: 'Fun and expressive 🎉🔥😋' },
  { id: 'moderate', title: 'A few here and there', desc: 'Tasteful, not overdone' },
  { id: 'light', title: 'Rarely', desc: 'Keep it mostly clean' },
  { id: 'none', title: 'None at all', desc: 'No emojis in our posts' },
] as const

// Per-day demand levels for the busy/slow rhythm step
export const RHYTHM_LEVELS = [
  { id: 'busy', label: 'Busy', color: '#4abd98' },
  { id: 'steady', label: 'Steady', color: '#e0a93a' },
  { id: 'slow', label: 'Slow', color: '#d9655a' },
] as const

export const LOCATION_COUNTS = ['Just 1', '2–3', '4–6', '7+'] as const

// Reservations platform — single choice (food only)
export const RESERVATIONS = [
  'OpenTable', 'Resy', 'Tock', 'Yelp Reservations',
  'In-house only', 'No reservations',
] as const

// Delivery platforms — multi-select (food only)
export const DELIVERY = [
  'DoorDash', 'Uber Eats', 'Grubhub', 'Toast', 'Our own', 'No delivery',
] as const

export const CUSTOMER_TYPES = [
  'Young professionals', 'College students', 'Families with kids', 'Couples',
  'Tourists / visitors', 'Locals & regulars', 'Health-conscious',
  'Foodies & adventurers', 'Budget-friendly seekers', 'Luxury / special occasion',
  'Seniors', 'Business professionals',
] as const

export const WHY_CHIPS = [
  'Great value', 'Unique offerings', 'Amazing experience', 'Convenient location',
  'Welcoming vibe', 'Fast & efficient', 'Family-friendly', 'Quality of service',
  'Trusted reputation', 'Personal touch',
] as const

export const GOAL_CHIPS = [
  'More customers on slow days', 'More foot traffic overall', 'Build local awareness',
  'Promote a specific offering', 'Grow social following', 'Improve online reputation',
  'Launch something new', 'Stay top of mind', 'Compete with nearby businesses',
  'More bookings or orders',
] as const

export const SUCCESS_CHIPS = [
  'More people walking in', 'People mention our social media', 'More DMs and inquiries',
  'Busier on slow days', 'Growing follower count', 'More shares and saves',
  'Stronger online presence', 'More bookings or orders', 'Better reviews online',
] as const

export const TIMELINE_CHIPS = ['ASAP', '1–3 months', '3–6 months', '6–12 months', 'No rush'] as const

export const TONE_CHIPS = [
  'Friendly & warm', 'Professional', 'Fun & playful', 'Bold & confident',
  'Casual', 'Inspirational', 'Educational', 'Luxurious',
] as const

export const CONTENT_CHIPS = [
  'Behind the scenes', 'Product / service close-ups', 'Customer stories',
  'Tips & how-tos', 'Promotions & offers', 'Seasonal content',
  'Team spotlights', 'Before & after', 'Trending / fun content',
  'Event coverage', 'Owner stories', 'Community involvement',
] as const

export const AVOID_CHIPS = [
  'Too salesy', 'Heavy text on images', 'Controversial topics', 'Stock photos',
  'Memes', 'Politics', 'Profanity', 'Religious content', 'Competitor mentions',
] as const

export const APPROVAL_TYPES = [
  { id: 'full', title: 'I want to see everything', desc: 'You approve all content before it goes live' },
  { id: 'partial', title: 'Just the big stuff', desc: 'You review campaigns and promos. Routine posts follow your guidelines.' },
  { id: 'minimal', title: 'I trust the team', desc: 'We post based on your strategy. You get performance updates.' },
  { id: 'rolling', title: "Let's collaborate as we go", desc: 'Content goes in a shared space. You comment when you can.' },
] as const

export const FILM_CHIPS = [
  'Owner', 'Managers', 'Employees', 'Customers (with consent)', 'No one, content only',
] as const

export const PLATFORMS = [
  { name: 'Instagram', emoji: '📸', color: '#e1306c', desc: 'Posts, reels, and stories' },
  { name: 'Facebook', emoji: '👥', color: '#1877f2', desc: 'Posts and community engagement' },
  { name: 'TikTok', emoji: '🎵', color: '#010101', desc: 'Short-form video content' },
  { name: 'Google Business', emoji: '🔍', color: '#4285f4', desc: 'Posts and review management' },
  { name: 'LinkedIn', emoji: '💼', color: '#0a66c2', desc: 'Professional content' },
  { name: 'Yelp', emoji: '⭐', color: '#d32323', desc: 'Review management' },
] as const

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// Step IDs in order — food steps are inserted dynamically
export type StepId =
  | 'role' | 'biz_name' | 'biz_type' | 'serve'
  | 'menu_details' | 'ordering' | 'menu' | 'specials'
  | 'location' | 'location_details' | 'rhythm' | 'story' | 'audience' | 'goals'
  | 'promote' | 'brand_voice' | 'discovery' | 'approval' | 'connect'
  | 'assets' | 'review'

// Each step belongs to a named phase. The wizard shows the phase label plus
// the owner's position within it ("Business · 2 of 3") so a long flow reads as
// a few short chapters instead of one endless list. Steps not present for a
// given business type (e.g. food-only steps) are simply skipped when counting.
export const PHASE_ORDER = ['You', 'Business', 'Menu', 'Story', 'Brand', 'Launch'] as const
export type PhaseLabel = typeof PHASE_ORDER[number]

export const STEP_PHASES: Record<StepId, PhaseLabel> = {
  role: 'You',
  biz_name: 'Business', biz_type: 'Business', location: 'Business', location_details: 'Business',
  serve: 'Menu', menu_details: 'Menu',
  ordering: 'Menu', menu: 'Menu', specials: 'Menu', rhythm: 'Menu',
  story: 'Story', audience: 'Story', goals: 'Story', promote: 'Story',
  brand_voice: 'Brand', discovery: 'Brand',
  approval: 'Launch', connect: 'Launch', assets: 'Launch', review: 'Launch',
}

export interface PhaseInfo {
  label: PhaseLabel
  indexInPhase: number   // 1-based position within the current phase
  phaseTotal: number     // steps in the current phase for this biz type
  phaseNumber: number    // 1-based index of the phase among phases present
  phaseCount: number     // total phases present for this biz type
}

/** Resolve the phase label + position for a step, given the active flow. */
export function getPhaseInfo(stepId: StepId, bizType: string): PhaseInfo {
  const steps = getSteps(bizType)
  const label = STEP_PHASES[stepId]
  const inPhase = steps.filter((s) => STEP_PHASES[s] === label)
  const presentPhases = PHASE_ORDER.filter((p) => steps.some((s) => STEP_PHASES[s] === p))
  return {
    label,
    indexInPhase: inPhase.indexOf(stepId) + 1,
    phaseTotal: inPhase.length,
    phaseNumber: presentPhases.indexOf(label) + 1,
    phaseCount: presentPhases.length,
  }
}

// Steps that always get their own screen, even inside a shared phase, because
// they are a focused review/detail page rather than a quick question.
const SOLO_SCREENS: StepId[] = ['location_details', 'review']

// A "screen" is one scrollable card that groups all the steps of a phase, so
// owners answer a few related questions at once instead of clicking through one
// question per page. Solo steps (location details, review) keep their own card.
export function getScreens(bizType: string): StepId[][] {
  const steps = getSteps(bizType)
  const screens: StepId[][] = []
  for (const phase of PHASE_ORDER) {
    const inPhase = steps.filter((s) => STEP_PHASES[s] === phase)
    if (!inPhase.length) continue
    let group: StepId[] = []
    for (const s of inPhase) {
      if (SOLO_SCREENS.includes(s)) {
        if (group.length) { screens.push(group); group = [] }
        screens.push([s])
      } else {
        group.push(s)
      }
    }
    if (group.length) screens.push(group)
  }
  return screens
}

/** A screen can advance only when every question on it passes validation. */
export function canContinueScreen(screen: StepId[], data: OnboardingData): boolean {
  return screen.every((s) => canContinue(s, data))
}

/** The phase label shown for a screen (its first step's phase). */
export function getScreenPhase(screen: StepId[]): PhaseLabel {
  return STEP_PHASES[screen[0]]
}

/** Map a saved 1-based step index to the 1-based screen that contains it. */
export function stepIndexToScreen(bizType: string, stepIndex1: number): number {
  const steps = getSteps(bizType)
  const stepId = steps[stepIndex1 - 1]
  if (!stepId) return 1
  const idx = getScreens(bizType).findIndex((sc) => sc.includes(stepId))
  return idx < 0 ? 1 : idx + 1
}

/** Map a 1-based screen index back to the step index of its first step. */
export function screenToStepIndex(bizType: string, screen1: number): number {
  const sc = getScreens(bizType)[screen1 - 1]
  if (!sc) return 1
  return getSteps(bizType).indexOf(sc[0]) + 1
}

export function getSteps(bizType: string): StepId[] {
  const isFood = FOOD_BIZ_TYPES.includes(bizType as typeof FOOD_BIZ_TYPES[number])
  const steps: StepId[] = ['role', 'biz_name', 'biz_type']
  if (isFood) {
    // Restaurant core: what they serve, how much it costs, signatures, dietary,
    // how people order, the real menu, and any recurring specials.
    steps.push('serve', 'menu_details', 'ordering', 'menu', 'specials')
  }
  // Locations: list each spot, then a review page pulls + records per-location
  // details (hours, phone) for each one.
  steps.push('location', 'location_details')
  // Busy/slow rhythm sits right after hours — it's the same mental model
  if (isFood) steps.push('rhythm')
  steps.push(
    'story', 'audience', 'goals',
    'promote', 'brand_voice', 'discovery', 'approval', 'connect',
    'assets', 'review',
  )
  return steps
}

// A single menu row captured during onboarding. Promoted to a
// menu_items row at completion.
export interface MenuDraftItem {
  name: string
  price: string      // free-form, e.g. "$12.99" or "" when no price
  category: string   // free-form section, e.g. "Tacos", "Drinks"
}

// A recurring special captured during onboarding. Promoted to a
// client_specials row at completion.
export interface SpecialDraft {
  title: string        // "Taco Tuesday", "Happy Hour"
  time_window: string  // "3pm–5pm daily", "Tuesdays"
  details: string      // what's included / the hook
}

// An additional location captured during onboarding (beyond the primary
// address on the location step). Promoted to a client_locations row at
// completion. The primary address is seeded separately as is_primary.
export interface LocationDraft {
  name: string          // a label, e.g. "Capitol Hill" or "Do Si Alki"
  full_address: string  // free-form or Places-formatted address
  city: string
  state: string
  zip: string
  place_id: string      // Google place_id when picked, for later GBP linking
  phone: string         // this location's phone (review page; not persisted to CRM yet)
  hours: Record<string, { open: string; close: string; closed: boolean }>
}

// Form data shape
export interface OnboardingData {
  role: string
  biz_name: string
  website: string
  phone: string
  biz_type: string
  biz_other: string
  cuisine: string
  cuisine_other: string
  service_styles: string[]
  price_range: string
  signature_items: string[]
  dietary_options: string[]
  reservations_platform: string
  delivery_platforms: string[]
  menu_items: MenuDraftItem[]
  specials: SpecialDraft[]
  locations: LocationDraft[]
  brand_hashtags: string[]
  target_keywords: string[]
  slow_periods: Record<string, string>
  full_address: string
  city: string
  state: string
  zip: string
  primary_location_name: string
  location_count: string
  primary_place_id: string  // Google place_id for the primary address, for auto-pulling hours/phone
  hours: Record<string, { open: string; close: string; closed: boolean }>
  biz_desc: string
  unique: string
  competitors: string
  customer_types: string[]
  customer_age_range: string
  why_choose: string[]
  primary_goal: string
  goal_detail: string
  success_signs: string[]
  timeline: string
  main_offerings: string
  upcoming: string
  tones: string[]
  avoid_tones: string[]
  emoji_usage: string
  custom_tone: string
  content_likes: string[]
  ref_accounts: string
  avoid_list: string[]
  approval_type: string
  can_film: string[]
  can_tag: string
  connected: Record<string, boolean>
  logo_name: string
  photo_count: number
  color1: string
  color2: string
  brand_drive: string
  agreed_terms: boolean
}

export const INITIAL_DATA: OnboardingData = {
  role: '',
  biz_name: '',
  website: '',
  phone: '',
  biz_type: '',
  biz_other: '',
  cuisine: '',
  cuisine_other: '',
  service_styles: [],
  price_range: '',
  signature_items: [],
  dietary_options: [],
  reservations_platform: '',
  delivery_platforms: [],
  menu_items: [],
  specials: [],
  locations: [],
  brand_hashtags: [],
  target_keywords: [],
  slow_periods: {},
  full_address: '',
  city: '',
  state: '',
  zip: '',
  primary_location_name: '',
  location_count: '',
  primary_place_id: '',
  hours: {},
  biz_desc: '',
  unique: '',
  competitors: '',
  customer_types: [],
  customer_age_range: '',
  why_choose: [],
  primary_goal: '',
  goal_detail: '',
  success_signs: [],
  timeline: '',
  main_offerings: '',
  upcoming: '',
  tones: [],
  avoid_tones: [],
  emoji_usage: '',
  custom_tone: '',
  content_likes: [],
  ref_accounts: '',
  avoid_list: [],
  approval_type: '',
  can_film: [],
  can_tag: '',
  connected: {},
  logo_name: '',
  photo_count: 0,
  color1: '#4abd98',
  color2: '#2e9a78',
  brand_drive: '',
  agreed_terms: false,
}

// Validation — which steps require data to continue
export function canContinue(stepId: StepId, data: OnboardingData): boolean {
  switch (stepId) {
    case 'role': return !!data.role
    case 'biz_name': return !!data.biz_name.trim()
    case 'biz_type': return !!(data.biz_type && (data.biz_type !== 'Other' || data.biz_other.trim()))
    case 'serve': return !!data.cuisine && !!data.price_range
      && (data.cuisine !== 'Other' || !!data.cuisine_other.trim())
    case 'menu_details': return data.signature_items.some((s) => s.trim().length > 0)
    case 'story': return !!data.biz_desc.trim()
    case 'goals': return !!data.primary_goal
    default: return true
  }
}
