/**
 * Mock data for the owner's standing marketing surfaces — the always-on work
 * that isn't a campaign: reputation (reviews), guests (CRM), presence (getting
 * found), and content (what goes out). Shaped the way real platform/Supabase
 * data would arrive, so swapping these arrays for live fetches is the only
 * change needed to go live. Everything downstream reads these types.
 */

/* ── Reputation: reviews across platforms ─────────────────────────── */
export type ReviewPlatform = 'google' | 'yelp' | 'tripadvisor' | 'facebook'
export const PLATFORM_META: Record<ReviewPlatform, { label: string; icon: string }> = {
  google: { label: 'Google', icon: '🔵' },
  yelp: { label: 'Yelp', icon: '🔴' },
  tripadvisor: { label: 'Tripadvisor', icon: '🟢' },
  facebook: { label: 'Facebook', icon: '🔷' },
}

export interface Review {
  id: string
  platform: ReviewPlatform
  author: string
  rating: number
  text: string
  /** Relative age label for the prototype. */
  ago: string
  responded: boolean
  /** AI-drafted response, ready for the owner to send or tweak. */
  draft?: string
  tags?: string[]
}

export const REVIEWS: Review[] = [
  { id: 'r1', platform: 'google', author: 'Marcus T.', rating: 5, ago: '2h ago', responded: false, tags: ['food', 'service'],
    text: 'Best brunch in the neighborhood. The staff remembered my order from last time — that kind of thing keeps me coming back.',
    draft: 'Marcus, this made our morning — thank you! Remembering our regulars is the whole point. See you at the next brunch. 🍳' },
  { id: 'r2', platform: 'yelp', author: 'Priya S.', rating: 2, ago: '5h ago', responded: false, tags: ['wait', 'service'],
    text: 'Food was good but we waited 40 minutes for a table with a reservation. Front of house seemed overwhelmed.',
    draft: 'Priya, I’m sorry the wait fell short of what a reservation should mean — that’s on us. We’ve added staff to Friday nights. I’d love to make the next visit right; please ask for me.' },
  { id: 'r3', platform: 'google', author: 'Dana W.', rating: 4, ago: '1d ago', responded: false, tags: ['food'],
    text: 'Lovely spot, great coffee. Only wish the patio had a little more shade in the afternoon.',
    draft: 'Thanks Dana! Glad the coffee hit the spot. Funny you mention shade — new patio umbrellas land next week. ☀️' },
  { id: 'r4', platform: 'tripadvisor', author: 'James & Lin', rating: 5, ago: '2d ago', responded: false, tags: ['ambiance'],
    text: 'Stumbled in while traveling and it became the highlight of our trip. Warm, unpretentious, delicious.',
    draft: 'What a thing to read — thank you both. Travelers becoming regulars-at-a-distance is our favorite kind of guest. Come back through anytime!' },
  { id: 'r5', platform: 'google', author: 'Sofia R.', rating: 5, ago: '3d ago', responded: true, tags: ['service'],
    text: 'My go-to for working mornings. Reliable, friendly, good wifi.' },
  { id: 'r6', platform: 'yelp', author: 'Ahmed K.', rating: 1, ago: '4d ago', responded: true, tags: ['order'],
    text: 'Online order was missing two items. Disappointing for the price.' },
  { id: 'r7', platform: 'google', author: 'Chris P.', rating: 5, ago: '5d ago', responded: true, tags: ['food'],
    text: 'The seasonal menu is always a treat. Pastry program is underrated.' },
]

export const REPUTATION = {
  rating: 4.6,
  ratingDelta: 0.1,
  count: 412,
  newThisWeek: 8,
  responseRate: 0.72,
  /** Share of recent reviews by sentiment. */
  sentiment: { positive: 78, neutral: 12, negative: 10 },
  byPlatform: [
    { platform: 'google' as ReviewPlatform, rating: 4.7, count: 286 },
    { platform: 'yelp' as ReviewPlatform, rating: 4.2, count: 94 },
    { platform: 'tripadvisor' as ReviewPlatform, rating: 4.5, count: 32 },
  ],
  /** What guests praise / gripe about most — pulled from review text. */
  themes: [
    { label: 'Friendly staff', count: 64, good: true },
    { label: 'Great coffee', count: 48, good: true },
    { label: 'Cozy atmosphere', count: 39, good: true },
    { label: 'Wait times', count: 17, good: false },
    { label: 'Online order accuracy', count: 9, good: false },
  ],
}

/* ── Guests: the CRM / audience ───────────────────────────────────── */
export interface Segment {
  id: string
  name: string
  icon: string
  count: number
  desc: string
  /** Suggested action for this segment. */
  idea: string
  tone: 'good' | 'opportunity' | 'risk'
}

export const SEGMENTS: Segment[] = [
  { id: 'regulars', name: 'Regulars', icon: '💛', count: 412, tone: 'good', desc: 'Visited 4+ times in 90 days', idea: 'Reward them — a members-only perk keeps them loyal.' },
  { id: 'new', name: 'First-timers', icon: '✨', count: 188, tone: 'opportunity', desc: 'One visit in the last 30 days', idea: 'Win the 2nd visit with a warm welcome offer.' },
  { id: 'lapsed', name: 'Slipping away', icon: '🌙', count: 263, tone: 'risk', desc: 'No visit in 60+ days', idea: 'A win-back text brings ~12% of these back.' },
  { id: 'vip', name: 'VIPs', icon: '👑', count: 41, tone: 'good', desc: 'Top 10% by spend', idea: 'Invite them first to events and new menus.' },
  { id: 'birthday', name: 'Birthdays soon', icon: '🎂', count: 34, tone: 'opportunity', desc: 'Birthday in the next 30 days', idea: 'A birthday treat fills tables and earns goodwill.' },
]

export const AUDIENCE = {
  total: 2840,
  newThisMonth: 188,
  growthPct: 7,
  contactable: { email: 2410, sms: 1620 },
}

export interface Broadcast {
  id: string
  name: string
  channel: 'email' | 'sms'
  to: string
  status: 'sent' | 'scheduled' | 'draft'
  when: string
  openRate?: number
  clicks?: number
}

export const BROADCASTS: Broadcast[] = [
  { id: 'b1', name: 'Slow-night comeback', channel: 'sms', to: 'Slipping away', status: 'sent', when: '3 days ago', openRate: 0.94, clicks: 112 },
  { id: 'b2', name: 'June seasonal menu', channel: 'email', to: 'All guests', status: 'sent', when: '1 week ago', openRate: 0.41, clicks: 286 },
  { id: 'b3', name: 'Father’s Day brunch', channel: 'email', to: 'Regulars + VIPs', status: 'scheduled', when: 'Sends Jun 18' },
  { id: 'b4', name: 'Birthday treat', channel: 'sms', to: 'Birthdays soon', status: 'draft', when: 'Not sent' },
]

/* ── Presence: getting found ──────────────────────────────────────── */
export type ChannelStatus = 'good' | 'attention' | 'missing'
export interface Channel {
  id: string
  name: string
  icon: string
  status: ChannelStatus
  completeness: number
  note: string
  /** Concrete fixes that would raise the score. */
  fixes: string[]
}

export const CHANNELS: Channel[] = [
  { id: 'google', name: 'Google Business Profile', icon: '🔵', status: 'attention', completeness: 82, note: 'Strong, but two things are costing you clicks.', fixes: ['Add 6 recent photos', 'Answer 3 guest questions'] },
  { id: 'website', name: 'Website & menu', icon: '🌐', status: 'good', completeness: 95, note: 'Mobile-fast and menu is up to date.', fixes: [] },
  { id: 'yelp', name: 'Yelp listing', icon: '🔴', status: 'attention', completeness: 68, note: 'Hours look outdated and photos are thin.', fixes: ['Confirm holiday hours', 'Add menu highlights'] },
  { id: 'instagram', name: 'Instagram', icon: '📸', status: 'good', completeness: 88, note: 'Active and on-brand.', fixes: ['Link in bio → online ordering'] },
  { id: 'maps', name: 'Apple Maps', icon: '🗺️', status: 'missing', completeness: 20, note: 'Not claimed — you’re invisible to iPhone Maps users.', fixes: ['Claim the listing', 'Add hours & category'] },
  { id: 'ordering', name: 'Online ordering', icon: '🛍️', status: 'good', completeness: 90, note: 'Connected and linked from Google.', fixes: [] },
]

export const PRESENCE = {
  score: 74,
  searchViews: 9240,
  searchDelta: 0.08,
  /** What people searched to find you. */
  topQueries: ['cafe near me', 'best brunch downtown', 'bella’s cafe', 'coffee open now'],
}

/* ── Content: what goes out ───────────────────────────────────────── */
export type ContentStatus = 'idea' | 'in-production' | 'needs-approval' | 'scheduled' | 'posted'
export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; tone: string }> = {
  idea: { label: 'Idea', tone: 'bg-[var(--canvas)] text-[var(--ink-3)]' },
  'in-production': { label: 'In production', tone: 'bg-amber-50 text-amber-700' },
  'needs-approval': { label: 'Needs your OK', tone: 'bg-[var(--brand-soft)] text-[var(--brand-darker)]' },
  scheduled: { label: 'Scheduled', tone: 'bg-blue-50 text-blue-700' },
  posted: { label: 'Posted', tone: 'bg-emerald-50 text-emerald-700' },
}

export type ContentType = 'reel' | 'photo' | 'post' | 'story' | 'email'
export const CONTENT_TYPE_ICON: Record<ContentType, string> = {
  reel: '🎬', photo: '📸', post: '🖼️', story: '📱', email: '✉️',
}

export interface ContentItem {
  id: string
  type: ContentType
  title: string
  channel: string
  status: ContentStatus
  when: string
  campaign?: string
  /** A short note on what it shows. */
  about: string
}

export const CONTENT: ContentItem[] = [
  { id: 'c1', type: 'reel', title: 'Signature burger, slow-mo cheese pull', channel: 'Instagram · TikTok', status: 'needs-approval', when: 'Wants to go out Fri', campaign: 'Weekend reels', about: 'A 12-second hero shot of the summer burger.' },
  { id: 'c2', type: 'email', title: 'Father’s Day brunch invite', channel: 'Email · 2,410 guests', status: 'needs-approval', when: 'Sends Jun 18', campaign: 'Father’s Day push', about: 'Warm invite with the prix-fixe menu and a reservation link.' },
  { id: 'c3', type: 'photo', title: 'Patio at golden hour', channel: 'Instagram', status: 'scheduled', when: 'Wed 6:00 PM', campaign: 'Weekend reels', about: 'Wide shot of the patio, umbrellas, warm light.' },
  { id: 'c4', type: 'story', title: 'Today’s special — peach galette', channel: 'Instagram Story', status: 'scheduled', when: 'Thu 11:00 AM', about: 'Quick story with a “save your slice” sticker.' },
  { id: 'c5', type: 'reel', title: 'Barista latte art, 3 ways', channel: 'Instagram · TikTok', status: 'in-production', when: 'Shooting Tue', campaign: 'Weekend reels', about: 'Three pours, satisfying close-ups.' },
  { id: 'c6', type: 'post', title: 'Trivia night flyer', channel: 'Instagram · Facebook', status: 'idea', when: 'Suggested', about: 'A graphic to fill Tuesday nights.' },
  { id: 'c7', type: 'reel', title: 'Behind the pass: morning prep', channel: 'Instagram', status: 'posted', when: 'Posted Mon · 14.2k reach', campaign: 'Weekend reels', about: 'The kitchen waking up — reached 14.2k.' },
  { id: 'c8', type: 'photo', title: 'New seasonal pastries', channel: 'Instagram', status: 'posted', when: 'Posted Sat · 2.1k likes', about: 'Flat-lay of the new pastry case.' },
]
