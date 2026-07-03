'use client'

/**
 * The plan flow — the mobile review screen AFTER the builder madlib.
 *  Step 2 "Your plan" — "The Release": a frosted glass cover stating what the plan wins you,
 *    a glowing teal spine threading the schedule, and per-piece cards that answer what / why /
 *    when / do-I-have-to-do-anything in plain words. One tap opens a single Customize sheet
 *    (what it shows / hook / channel / week / swap / remove). Plan-wide Featuring + Hook pills
 *    edit every untouched piece at once. No money, no who-makes-it here.
 *  Step 3 "Order summary" — the price: what you're getting (pick who makes each), billing, timeline.
 * On confirm it hands the finished draft + service choices up to the host to persist + ship.
 * Mobile-only. All edits live in local state until confirm.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, X, Loader2, Rocket, Flag, DoorOpen, CalendarDays, Pencil, Plus, Minus, Trash2, Repeat, Moon, Heart, Star, Smartphone, LockOpen, Camera, Megaphone, Sparkles, Image as ImageIcon, Upload, Check, Scissors, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MapPin, Globe, LineChart, BarChart3, Video, QrCode, Tag, Utensils, MessageCircle, Home, Store, ArrowLeftRight, Newspaper, Share2, UserPlus, RotateCcw, Mail, MessageSquare, Award, Cake, Gift, Crown, CalendarCheck, Users } from 'lucide-react'
import { C, GRAD, money } from '@/components/campaigns/ui'
import { draftFromBuilder } from '@/lib/campaigns/builder/adapter'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { deriveSchedule } from '@/lib/campaigns/schedule'
import { aggregateGoLive, addBusinessDays } from '@/lib/campaigns/aggregate-golive'
import { buildContentLine, serviceById, serviceToLines, addableByStage, cadenceOf } from '@/lib/campaigns/catalog'
import type { PricedService } from '@/lib/campaigns/data/priced-catalog'
import { SERVICE_CHANNELS } from '@/lib/campaigns/data/service-channels'
import { VOLUME_RATES, priceForQty, eachAtQty, clampQty, isQtyAdjustable } from '@/lib/campaigns/data/volume-rates'
import { creatorById } from '@/lib/campaigns/creators'
import { summarize, lineTotal, type CampaignDraft, type ContentBeat, type LineItem, type PieceProducer, type BillingSummary, type CampaignReceipt } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import ServicePicker from '@/components/campaigns/content-menu/service-picker'
import { TYPE_ICON } from '@/components/campaigns/content-menu/add-piece-modal'

const DISPLAY = "'Cal Sans','Inter',sans-serif"
const PAPER = '#FBFAF8'
const isContent = (it: LineItem) => /^content-/.test(it.serviceId ?? '')
const typeOf = (it: LineItem) => (it.serviceId ?? '').replace(/^content-/, '')
const serviceLabel = (p: PieceProducer, creatorName?: string) =>
  p === 'creator' ? (creatorName ?? 'A creator') : p === 'diy' ? 'You' : p === 'ai' ? 'AI draft' : 'Your team'

function producerAwareBill(items: LineItem[], pieces: { priceCents: number }[]): BillingSummary {
  const base = summarize(items.filter((it) => it.included && !isContent(it)))
  const content = pieces.reduce((s, p) => s + p.priceCents, 0) / 100
  return { ...base, oneTimeOnDelivery: base.oneTimeOnDelivery + content }
}
function fmtDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}

/* ── Piece copy + identity ─────────────────────────────────── */
const nounFor = (type: string) => (type === 'sms' ? 'text' : type)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const noop = () => undefined
const CHANNEL_LABEL: Record<string, string> = {
  reels: 'Instagram · TikTok', social: 'Instagram · Facebook', gbp: 'Google', email: 'Email', sms: 'Text', ads: 'Paid ads',
}
const CHANNELS_FOR_TYPE: Record<string, string[]> = {
  reel: ['reels'], photo: ['social', 'gbp'], story: ['social'], post: ['social', 'gbp'], email: ['email'], sms: ['sms'],
}
const channelLabel = (channel: string, type: string) => (type === 'story' ? 'Instagram Story' : CHANNEL_LABEL[channel] ?? cap(channel))
// The "Plan Card" editor config — what each content type needs, in plain words.
type AskKind = 'dish' | 'footage' | 'dishOrMoment' | 'subject' | 'message' | 'button'
const TYPE_CONFIG: Record<string, { word: string; verb: string; asks: AskKind[]; helper?: 'clip' | 'photo'; channelChip: boolean }> = {
  reel: { word: 'video', verb: "We'll film this", asks: ['dish', 'footage'], helper: 'clip', channelChip: true },
  photo: { word: 'photo', verb: "We'll shoot this", asks: ['dish', 'footage'], helper: 'photo', channelChip: true },
  story: { word: 'story', verb: "We'll make this", asks: ['dishOrMoment'], helper: 'clip', channelChip: false },
  post: { word: 'post', verb: "We'll design this", asks: ['subject'], channelChip: true },
  email: { word: 'email', verb: "We'll write this", asks: ['message', 'button'], channelChip: false },
  sms: { word: 'text', verb: "We'll write this", asks: ['message'], channelChip: false },
}
const MOMENTS = ['In the kitchen', 'A busy night', "Today's special"]
const BUTTON_OPTS: { key: 'menu' | 'book' | 'order' | 'deal'; label: string }[] = [{ key: 'menu', label: 'See menu' }, { key: 'book', label: 'Book a table' }, { key: 'order', label: 'Order now' }, { key: 'deal', label: 'Get the deal' }]
const POST_SUBJECTS: { key: 'dish' | 'deal' | 'news'; label: string }[] = [{ key: 'dish', label: 'A dish' }, { key: 'deal', label: 'A deal' }, { key: 'news', label: 'News' }]
const FOOTAGE: { key: 'photo' | 'clip' | 'film'; label: string; Icon: ComponentType<{ size?: number; color?: string }> }[] = [{ key: 'photo', label: 'Use my menu photo', Icon: ImageIcon }, { key: 'clip', label: "I'll send a clip", Icon: Upload }, { key: 'film', label: 'You film it', Icon: Camera }]
// Plain "where it posts", finishing the piece sentence.
const channelPhrase = (type: string, channel: string): string => {
  if (type === 'reel') return 'going out on Instagram + TikTok'
  if (type === 'story') return 'as an Instagram Story for 24 hours'
  if (type === 'email') return 'sent to your email list'
  if (type === 'sms') return 'as a text to your list'
  return channel === 'gbp' ? 'going up on your Google listing' : 'posting to Instagram + Facebook'
}
const SWAP_TYPES = ['reel', 'photo', 'post', 'story', 'email', 'sms'] as const
// The platforms a service/piece touches, read straight from its plain-English catalog deliverables —
// so a row can say "Reels, posted to Instagram + TikTok" with no new catalog fields.
const CHANNEL_SCAN: { re: RegExp; label: string }[] = [
  { re: /instagram|\bIG\b|\breels?\b/i, label: 'Instagram' },
  { re: /tiktok/i, label: 'TikTok' },
  { re: /facebook|\bFB\b/i, label: 'Facebook' },
  { re: /google|\bGBP\b|\bmaps\b/i, label: 'Google' },
  { re: /yelp/i, label: 'Yelp' },
  { re: /tripadvisor/i, label: 'TripAdvisor' },
  { re: /\bemail\b|newsletter/i, label: 'Email' },
  { re: /\btext\b|\bsms\b/i, label: 'Text' },
  { re: /\bwebsite\b|your site|landing page/i, label: 'Website' },
  { re: /delivery|doordash|uber eats|grubhub/i, label: 'Delivery apps' },
]
const channelsFrom = (text: string): string[] => { const out: string[] = []; for (const c of CHANNEL_SCAN) if (c.re.test(text) && !out.includes(c.label)) out.push(c.label); return out }
// Color carries meaning in exactly one place: a small per-type tile + spine node.
const TYPE_TINT: Record<string, { tint: string; fg: string }> = {
  reel: { tint: '#FAECE7', fg: '#993C1D' }, photo: { tint: '#E6F1FB', fg: '#185FA5' }, story: { tint: '#FBEAF0', fg: '#993556' },
  post: { tint: '#E1F5EE', fg: '#0F6E56' }, email: { tint: '#FAEEDA', fg: '#854F0B' }, sms: { tint: '#EEEDFE', fg: '#534AB7' },
}
const tintFor = (type: string) => TYPE_TINT[type] ?? { tint: C.bg, fg: C.mute }
const GOAL_HERO: Record<string, { label: string; Icon: ComponentType<{ size?: number; color?: string }>; bg: string; fg: string }> = {
  'new-customers': { label: 'New customers', Icon: Rocket, bg: '#eaf1fb', fg: '#185fa5' },
  'slow-nights': { label: 'Fill slow nights', Icon: Moon, bg: '#fdeee3', fg: '#993c1d' },
  'regulars': { label: 'Keep regulars', Icon: Heart, bg: '#f1edfb', fg: '#534ab7' },
  'reviews': { label: 'More reviews', Icon: Star, bg: '#fdeef3', fg: '#993556' },
}
const HERO_FALLBACK = { label: 'Campaign', Icon: Rocket, bg: '#eaf7f3', fg: C.greenDk }
const AUD_LABEL: Record<string, string> = { 'new-locals': 'new locals nearby', lapsed: 'lapsed regulars', regulars: 'your regulars', firsttimers: 'recent first-timers', vips: 'your VIPs', families: 'families', datenight: 'the date-night crowd', everyone: 'everyone' }
function weekTagline(idx: number, count: number): string {
  if (count <= 1) return 'All at once'
  if (idx === 0) return 'Go loud'
  if (idx === count - 1) return 'Close it out'
  return 'Keep the proof coming'
}

const FALLBACK_WHY: Record<string, string> = { reel: 'Catches attention in the feed', photo: 'Shows your food at its best', story: 'Keeps you top-of-mind', post: 'Helps the right people find you', email: 'Brings guests back', sms: 'A quick nudge to your guests' }
const WHY: Record<string, Record<string, (d: string) => string>> = {
  'new-customers': { reel: (d) => `Gets new neighbors curious about ${d}`, photo: () => 'Shows off the dish that pulls people in', story: () => 'Puts a face to your kitchen for new locals', post: () => 'Helps you show up when locals search', email: () => 'Invites your list to bring a friend', sms: () => 'A quick nudge to first-timers nearby' },
  'slow-nights': { reel: () => "Reminds locals you're open and worth the trip", photo: () => 'Makes a quiet night look like the place to be', story: () => 'Keeps you top-of-mind before they pick', post: () => 'Catches people deciding where to eat tonight', email: () => 'Nudges your list to come in on a quiet night', sms: () => 'A day-of text to help fill a slow shift' },
  'regulars': { reel: () => 'Gives regulars a reason to come back this week', photo: () => 'Reminds your fans what they love', story: () => 'Keeps the relationship warm between visits', post: () => 'Stays in the feed of people who love you', email: () => 'Brings recent guests back for another visit', sms: () => 'A personal nudge to your regulars' },
  'reviews': { reel: () => 'Shows the experience worth raving about', photo: () => 'Gives happy guests something to share', story: () => 'Reminds guests to leave a quick review', post: () => 'Answers searchers with your best foot forward', email: () => 'Asks happy guests for a quick review', sms: () => 'A friendly ask for a review after a visit' },
}
const whyLine = (goalKey: string | undefined, type: string, dish: string) => (WHY[goalKey ?? '']?.[type]?.(dish || 'your food') ?? FALLBACK_WHY[type] ?? 'Keeps your restaurant in front of the right people')

/* ── The Walk: one continuous customer story, told in three plain acts ──
 * Instead of "Week 1 / Week 2 / Week 3" (which makes an owner count time), the plan groups its
 * pieces by what each one DOES for a new guest: get noticed → give it a try → come back. This maps
 * to the composer's funnel legs (seen → convert → keep), which we read straight off each beat's
 * descriptive label/because, so no schema or composer change is needed. */
type Act = 'notice' | 'try' | 'back'
const ACT_ORDER: Act[] = ['notice', 'try', 'back']
const ACT_META: Record<Act, { title: string; sub: string; think: string }> = {
  notice: { title: 'They notice you', sub: 'Show up where people are looking', think: '“Wait, what’s that place?”' },
  try: { title: 'They give it a try', sub: 'A reason to come in now', think: '“Is it worth stopping for?”' },
  back: { title: 'They come back', sub: 'Turn one visit into a regular', think: '“When can I have that again?”' },
}
/** Each act is a week of the rollout (notice → 1, try → 2, back → 3), so an ongoing monthly set rolls
 *  out over ~3 weeks instead of one-piece-per-week stretching it to six. */
const actWeek = (act: Act): number => (act === 'notice' ? 1 : act === 'try' ? 2 : 3)

/* System plans (firstvisit / nights / regulars): stage labels are goal-defined and ride on the
 * draft (initial.stages); the plan flow renders them in order as simple cards. */
const MOVE_ICON: Record<string, LucideIcon> = {
  'gbp-setup': MapPin, 'gbp-posts': MapPin, 'listings-sync': MapPin, 'review-claim': MapPin,
  'site-menu': Globe, 'website-care': Globe, 'tracking': LineChart, 'reporting': BarChart3,
  'photo-library': Camera, 'video-engine': Video, 'video-single': Video, 'graphic': ImageIcon,
  'capture-kit': QrCode, 'crm-list': Users, 'landing-page': Globe, 'incentive-design': Gift,
  'offer-eng': Tag, 'menu-eng': Utensils,
  'review-engine': Star, 'review-responses': Star, 'feedback-loop': MessageCircle,
  'nextdoor-local': Home, 'street-sampling': Store, 'creator-collab': Sparkles, 'concierge': Crown,
  'cross-promo': ArrowLeftRight, 'paid-ads': Megaphone, 'pr-media': Newspaper, 'social-mgmt': Share2,
  'friend-hook': UserPlus, 'referral': Share2, 'second-visit': Repeat, 'winback': RotateCcw,
  'welcome-seq': Mail, 'newsletter': Mail, 'email-found': Mail,
  'sms-program': MessageSquare, 'sms-found': MessageSquare, 'reminder-send': MessageSquare,
  'loyalty': Award, 'birthday': Cake, 'giftcards': Gift, 'vip-comms': Crown,
  'bar-events': CalendarDays, 'event-pkg': CalendarDays, 'seasonal-cal': CalendarDays, 'reservation-protect': CalendarCheck,
}
const moveIcon = (sid: string): LucideIcon => MOVE_ICON[sid] ?? Sparkles
/** Classify a piece into its act from the composer's descriptive label + situational `because`
 *  (e.g. "Offer post — a reason to come in" → try, "Table QR to grow your list" → back). Computed
 *  once at beat init and stored, so it stays stable across owner edits/swaps. */
function actOf(type: string, label: string, because?: string): Act {
  const s = `${label} ${because ?? ''}`.toLowerCase()
  if (/come ?-?back|return|\bagain\b|loyal|regular|second ?-?visit|2nd|thank|check.?in|\bqr\b|grow your list|capture|win.?back|re-?engage|reminder/.test(s)) return 'back'
  if (/offer|deal|reason to come|come in|\bbook\b|reserve|order now|day.?before|day.?of|tonight|follow.?up|rsvp|claim|redeem/.test(s)) return 'try'
  if (type === 'sms') return 'back'
  if (type === 'email') return 'try'
  return 'notice'
}

type Beat = {
  id: string; type: string; channel: string; week: number; featuring: string; offer: string; note: string; baseLabel: string; edited: boolean; act: Act
  // "Plan Card" per-type extras — all optional, defaulted at render, captured for the team's brief
  footage?: 'photo' | 'clip' | 'film'; subjectKind?: 'dish' | 'deal' | 'news'; newsLine?: string
  messagePoint?: string; buttonTarget?: 'menu' | 'book' | 'order' | 'deal'; onCamera?: 'owner' | 'staff' | 'food'
  addPoll?: boolean; hasReference?: boolean; dateISO?: string; boost?: boolean; because?: string
}
// The convincing, dish-forward headline for a piece (the "where it posts" comes from channelPhrase).
const beatLabel = (b: Beat): string => {
  const d = b.featuring?.trim(); const o = b.offer?.trim()
  switch (b.type) {
    case 'reel': return d ? `A quick reel of your ${d}, steaming and fresh` : "A quick reel of today's best plate, steaming and fresh"
    case 'photo': return d ? `A photo of your ${d}, plated and glowing` : 'A photo of your best plate, fresh out of the kitchen'
    case 'story': return d ? `A quick peek at your ${d} coming together` : 'A quick peek behind your kitchen'
    case 'post':
      if (b.subjectKind === 'news' && b.newsLine?.trim()) return `A post sharing your news — ${b.newsLine.trim()}`
      if (b.subjectKind === 'deal' && o) return `A post announcing ${o}`
      return d ? `A post showing off your ${d}, fresh and ready` : "A post sharing what's good in your kitchen right now"
    case 'email': return b.messagePoint?.trim() ? `An email about ${b.messagePoint.trim()}` : (o ? `An email telling your regulars about ${o}` : "An email telling your regulars what's good this week")
    case 'sms': return b.messagePoint?.trim() ? `A quick text — ${b.messagePoint.trim()}` : (o ? `A quick text dropping ${o} to your list` : 'A quick text reminding your list to come back in')
    default: return cap(b.type)
  }
}

// Budget trimming (advisory): a piece's funnel role + impact weight. To fit a plan
// under the owner's monthly budget we drop the lowest-impact EXTRAS first, never
// emptying the get-seen or the convert side of the funnel.
const PIECE_ROLE: Record<string, 'seen' | 'convert'> = { reel: 'seen', photo: 'seen', story: 'seen', post: 'convert', email: 'convert', sms: 'convert' }
// Owned-channel sends (email/SMS to your own list) are high-ROI, so they outrank an extra
// social post/story when a plan is trimmed to fit — the list stays the spine of a launch.
const PIECE_IMPACT: Record<string, number> = { reel: 5, email: 5, sms: 4, photo: 4, post: 4, story: 2 }

/** Which pieces to drop (lowest-impact first, biggest-saving as the tiebreak) to bring a
 *  plan ~`overDollars` under budget, while keeping at least one get-seen and one convert
 *  piece. Free (DIY) pieces are skipped — dropping them saves nothing. Returns beat ids. */
function planTrim(creatives: { id?: string; type: string; cents: number }[], overDollars: number): string[] {
  if (overDollars <= 0) return []
  let seen = creatives.filter((c) => PIECE_ROLE[c.type] === 'seen').length
  let conv = creatives.filter((c) => PIECE_ROLE[c.type] === 'convert').length
  const order = creatives
    .filter((c) => c.id && c.cents > 0)
    .sort((a, b) => (PIECE_IMPACT[a.type] ?? 1) - (PIECE_IMPACT[b.type] ?? 1) || b.cents - a.cents)
  const drop: string[] = []
  let saved = 0
  for (const c of order) {
    const role = PIECE_ROLE[c.type]
    if (role === 'seen' && seen <= 1) continue
    if (role === 'convert' && conv <= 1) continue
    drop.push(c.id as string); saved += c.cents / 100
    if (role === 'seen') seen--; else if (role === 'convert') conv--
    if (saved >= overDollars) break
  }
  return drop
}

// One depth ramp + tone family for The Path. Defined once; used everywhere.
const E1 = '0 2px 6px -2px rgba(20,20,40,.06), 0 8px 22px -14px rgba(20,20,40,.14)'
const E2 = '0 10px 34px -14px rgba(20,20,40,.18)'
const E3 = '0 18px 50px -18px rgba(20,20,40,.24)'
const INSET_HI = 'inset 0 1px 0 rgba(255,255,255,.7)'
const SPINE_GRAD = 'linear-gradient(180deg,#16a34a 0%, #2e9a78 45%, #9fe1cb 100%)'
const BRAND_GRAD = 'linear-gradient(135deg,#16a34a,#0f6e56)'
// The three chapter tones — warm-to-resolve (notice → try → back), one place color carries meaning.
type ChapterTone = { bg: string; fg: string }
const TONE_NOTICE: ChapterTone = { bg: '#E6F1FB', fg: '#185FA5' } // awareness (blue)
const TONE_TRY: ChapterTone = { bg: '#FAEEDA', fg: '#b07d1e' }    // convert    (gold)
const TONE_BACK: ChapterTone = { bg: '#E1F5EE', fg: '#0f6e56' }   // retain     (green)
const TONE_RAMP: ChapterTone[] = [TONE_NOTICE, TONE_TRY, TONE_BACK]
const toneAt = (i: number): ChapterTone => TONE_RAMP[Math.min(Math.max(i, 0), 2)]

const KEYFRAMES = `
@keyframes planFadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes planTextFade { from { opacity: .4 } to { opacity: 1 } }
@keyframes planPulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5) } 70% { box-shadow: 0 0 0 8px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }
@media (prefers-reduced-motion: no-preference) {
  @keyframes spineDraw { from { clip-path: inset(0 0 100% 0) } to { clip-path: inset(0 0 0 0) } }
  @keyframes pfIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  @keyframes stampIn { from { transform: scale(1.6) rotate(-8deg); opacity: 0 } to { transform: scale(1) rotate(-4deg); opacity: 1 } }
  @keyframes pfShimmer { from { background-position: -180px 0 } to { background-position: 180px 0 } }
  .pf-up { animation: planFadeUp .5s cubic-bezier(.2,.7,.2,1) both }
  .pf-text { animation: planTextFade .32s ease }
  .pf-pulse { animation: planPulse 2.2s ease-out infinite }
  .pf-spine { animation: spineDraw .7s cubic-bezier(.2,.7,.2,1) both }
  .pf-charge { animation: spineDraw .8s cubic-bezier(.2,.7,.2,1) both }
  .pf-card { animation: pfIn .5s cubic-bezier(.2,.7,.2,1) both }
  .pf-stamp { animation: stampIn .4s cubic-bezier(.2,.9,.3,1.2) both }
  .pf-shim { background: linear-gradient(90deg,#f1f1f3 0%,#f8f8fa 50%,#f1f1f3 100%); background-size: 360px 100%; animation: pfShimmer 1.2s linear infinite }
}`

/* ── The Path: one ordered list of stops, rendered through ONE loop ──
 * buildStops() collapses the three old layouts (system service-list, the Walk, the week view)
 * into a single Stop[] over the already-memoized data. Presentation-only, crash-safe. */
type CardNode =
  | {
      variant: 'service'; Icon: LucideIcon; title: string; deliverable: string; priceShort: string;
      spine: boolean; included: string[]; pieces?: { label: string; qty: number; each: number }[];
      channels?: string[]; onOpen: () => void; onRemove?: () => void; readOnly?: boolean
      /** Present only for quantity-adjustable services (the rate card). Drives the inline stepper. */
      qty?: {
        value: number; min: number; max: number; step: number; unit: string; unitPlural: string
        total: number; each: number; cadence: 'monthly' | 'one-time' | 'per-occurrence'; tiered: boolean
        onChange: (n: number) => void
      }
    }
  | {
      variant: 'content'; b: Beat; d?: { postLabel: string; relLabel: string; draftReadyISO: string };
      tint: { tint: string; fg: string }; Icon?: ComponentType<{ size?: number; color?: string }>;
      photo?: string; nextUp: boolean; needsPhoto: boolean; idx: number; ongoing: boolean; onOpen: () => void
    }
type Stop =
  | { kind: 'hero' }
  | { kind: 'chapter'; id: string; badge: number | 'arrival' | 'setup'; tone: ChapterTone; title: string; caption?: string; think?: string }
  | { kind: 'card'; id: string; node: CardNode }
  | { kind: 'amp'; id: string; Icon: ComponentType<{ size?: number; color?: string }>; title: string; dateLabel: string; desc: string; priceLabel?: string }
  | { kind: 'add'; id: string; label: string; onAdd: () => void }
  | { kind: 'endcap'; id: string }

export default function CampaignPlanFlow({ itemId, vals, menu, busy, error, monthlyCap = 0, outcome, lead, doneSetup, onConfirm, onBack }: {
  itemId: string
  vals: Record<string, unknown>
  restaurant: string
  menu?: { l: string; photo?: string }[]
  busy?: boolean
  error?: string | null
  /** Setup serviceIds the restaurant already has (from CampaignProfile.doneSetup) — skipped in the go-live estimate. */
  doneSetup?: string[]
  /** The owner's monthly marketing budget (dollars). 0 = none set → no budget signal. */
  monthlyCap?: number
  /** The result the brain built this plan to move, e.g. "fuller tables on your slow nights". */
  outcome?: string | null
  /** The cold-start reason the brain shaped the lead, e.g. "Led with reviews because your rating is 4.1…". */
  lead?: string | null
  onConfirm: (payload: { draft: CampaignDraft; producerChoices: Record<string, PieceProducer>; receipt: CampaignReceipt }) => void
  onBack: () => void
}) {
  // When reputation holds the paid-ads line, the owner can override ("run ads anyway") — re-derive
  // the plan with spec.reachOverride='on', which restores the normal paid reach.
  const [adsOverride, setAdsOverride] = useState(false)
  const initial = useMemo(() => draftFromBuilder({ itemId, status: 'approve', vals: adsOverride ? { ...vals, reachOverride: 'on' } : vals }), [itemId, vals, adsOverride])
  // The lean spine = the services that survive at the lowest budget tier. We badge these "Start here"
  // so a dense standard plan still tells a non-marketer owner where to begin (without dropping the rest).
  const spineIds = useMemo(() => new Set((draftFromBuilder({ itemId, status: 'approve', vals: { ...vals, budget: 'lean' } }).moves ?? []).map((m) => m.serviceId)), [itemId, vals])
  const seedFeat = (initial.brief?.spec?.feature ?? '').trim()
  const seedOffer = (initial.brief?.spec?.offer ?? initial.brief?.offer?.label ?? '').trim()
  const ongoing = initial.intent === 'ongoing'
  const durationWeeks = initial.brief?.durationWeeks ?? null

  const [beats, setBeats] = useState<Beat[]>(() => (initial.brief?.contentBeats ?? []).map((b, i) => {
    const act = actOf(b.type, b.label, b.because)
    return {
      id: `b${i}`, type: b.type, channel: b.channel,
      // An ongoing program rolls out as the 3-act Walk: each act is a week, so the monthly set lands in
      // ~3 weeks rather than one piece per week over six. Events keep their countdown weeks (real meaning).
      week: ongoing ? actWeek(act) : (b.week || 1),
      featuring: ['reel', 'photo', 'story', 'post'].includes(b.type) ? seedFeat : '', offer: seedOffer, note: '', baseLabel: b.label, edited: false,
      boost: b.boost || false, because: b.because || undefined, act,
    }
  }))
  const [planFeat, setPlanFeat] = useState(seedFeat)
  const [planOffer, setPlanOffer] = useState(seedOffer)
  const [choices, setChoices] = useState<Record<string, PieceProducer>>({})
  const [step, setStep] = useState<'review' | 'summary'>('review')
  const [picker, setPicker] = useState<{ type: string; keys: string[]; producer: PieceProducer; creatorName?: string } | null>(null)
  const [sheet, setSheet] = useState<{ kind: 'piece'; id: string } | { kind: 'service'; id: string } | { kind: 'field'; field: 'feature' | 'offer' } | null>(null)
  const undoRef = useRef<Beat[]>([])
  const [undo, setUndo] = useState<Beat[] | null>(null)
  // The approve "wax-seal" one-shot fires inline on the end-cap before handing off to the summary step.
  const [confirming] = useState(false)
  // System-plan moves the owner dropped (by serviceId). Their line items leave the bill and the
  // move leaves the stage; a toast offers a one-tap restore.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const [removedToast, setRemovedToast] = useState<{ id: string; name: string } | null>(null)
  // Services the owner added to a stage (full customization). `addPicker` holds the target stage while open.
  const [addedMoves, setAddedMoves] = useState<{ serviceId: string; stage: string }[]>([])
  const [addPicker, setAddPicker] = useState<string | null>(null)
  // Per-service quantity the owner tuned (how many reels / texts / photos). Keyed by serviceId — the
  // ONE writable source; price, the pieces line and the bill all DERIVE from it via VOLUME_RATES. Only
  // services in that rate card are adjustable; everything else stays at its catalog count.
  const [serviceQty, setServiceQty] = useState<Record<string, number>>({})
  const setServiceQtyFor = (serviceId: string, n: number) => setServiceQty((s) => ({ ...s, [serviceId]: clampQty(serviceId, n) }))

  const dishes = useMemo(() => (menu ?? []).map((m) => m.l).filter(Boolean).slice(0, 14), [menu])
  const photoMap = useMemo(() => { const m = new Map<string, string>(); for (const x of menu ?? []) if (x.photo) m.set(x.l.toLowerCase(), x.photo); return m }, [menu])
  const dishPhoto = (featuring: string) => (featuring ? photoMap.get(featuring.trim().toLowerCase()) : undefined)

  const editedBeats = useMemo<(ContentBeat & { id: string; note?: string; footage?: string; subjectKind?: string; newsLine?: string; messagePoint?: string; buttonTarget?: string })[]>(() => beats.map((b) => ({ id: b.id, week: b.week, type: b.type, channel: b.channel, label: beatLabel(b), dateISO: b.dateISO, note: b.note || undefined, footage: b.footage, subjectKind: b.subjectKind, newsLine: b.newsLine || undefined, messagePoint: b.messagePoint || undefined, buttonTarget: b.buttonTarget, ...(b.boost ? { boost: true } : {}), ...(b.because ? { because: b.because } : {}) })), [beats])
  // Apply the owner's quantity tune to a service line. Flat lines (monthly/one-time) get their price
  // overridden to the honest total for that count; per-unit lines just carry the new qty (lineTotal
  // already multiplies). Non-adjustable services and non-matching billing kinds pass through untouched,
  // and at the catalog's base count priceForQty returns the exact catalog price (no drift). Never mutates
  // the source line — always returns a clone.
  const applyQty = (it: LineItem): LineItem => {
    const r = VOLUME_RATES[it.serviceId ?? '']
    const q = it.serviceId ? serviceQty[it.serviceId] : undefined
    if (!r || q == null) return it
    const match = r.cadence === 'monthly' ? (it.cadence.kind === 'recurring' && it.cadence.every === 'monthly')
      : r.cadence === 'one-time' ? it.cadence.kind === 'one-time'
      : it.cadence.kind === 'per-occurrence'
    if (!match) return it
    if (it.cadence.kind === 'per-occurrence') return { ...it, qty: q }
    const p = priceForQty(it.serviceId, q)
    return p == null ? it : { ...it, price: p }
  }
  const items = useMemo<LineItem[]>(() => {
    const counts = new Map<string, number>(); for (const b of beats) counts.set(b.type, (counts.get(b.type) ?? 0) + 1)
    const out: LineItem[] = []; let i = 0
    for (const [type, qty] of counts) { const li = buildContentLine(type, `li-c-${type}-${i++}`, { qty }); if (li) out.push(li) }
    for (const it of initial.items) if (!isContent(it)) out.push(applyQty(it))
    // Services the owner added: each becomes real line item(s) so it counts in the bill.
    for (const a of addedMoves) { const s = serviceById(a.serviceId); if (s) out.push(...serviceToLines(s, `li-add-${a.serviceId}`).map(applyQty)) }
    // Drop any move the owner removed (system plans) — its line(s) leave the bill everywhere.
    return removed.size ? out.filter((it) => !removed.has(it.serviceId ?? '')) : out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats, initial.items, removed, addedMoves, serviceQty])

  const camp = useMemo<SavedCampaign>(() => ({
    clientId: '', draft: { ...initial, items, brief: initial.brief ? { ...initial.brief, contentBeats: editedBeats } : initial.brief }, phase: 'build', status: 'draft', shippedAt: null,
    createdAt: '', updatedAt: '', creatorChoices: {}, producerChoices: choices, creativeControl: 'handoff', execution: {},
  }), [initial, items, editedBeats, choices])

  const todayISO = new Date().toISOString().slice(0, 10)
  const pieces = useMemo(() => planCampaignPieces(camp, todayISO), [camp, todayISO])
  const sched = useMemo(() => deriveSchedule({ targetDate: initial.targetDate, occasion: initial.occasion, contentBeats: editedBeats }, todayISO), [initial, editedBeats, todayISO])
  const dateById = useMemo(() => { const m = new Map<string, { postISO: string; postLabel: string; draftReadyISO: string; relLabel: string }>(); for (const b of sched.beats) { const id = (b as { id?: string }).id; if (id) m.set(id, b) } return m }, [sched])
  const bill = producerAwareBill(items, pieces)
  const services = items.filter((it) => it.included && !isContent(it))

  // Each real creative (a named piece) joined to its price + who-makes-it, in plan (date) order.
  const creatives = useMemo(() => {
    const used = new Map<string, number>(); const byT = new Map<string, Beat[]>()
    for (const b of beats) { const a = byT.get(b.type) ?? []; a.push(b); byT.set(b.type, a) }
    return pieces.map((p) => {
      const j = used.get(p.type) ?? 0; used.set(p.type, j + 1)
      const b = byT.get(p.type)?.[j]
      return { key: p.key, id: b?.id, type: p.type, label: b ? beatLabel(b) : cap(nounFor(p.type)), producer: p.producer, cents: p.priceCents, iso: b ? dateById.get(b.id)?.postISO : undefined, creatorName: p.creatorId ? creatorById(p.creatorId)?.name ?? undefined : undefined }
    }).sort((x, y) => (x.iso ?? '').localeCompare(y.iso ?? ''))
  }, [pieces, beats, dateById])

  // ── budget fit (advisory): the campaign's first-month cost vs the owner's monthly
  // budget. We never auto-resize — just surface the fit and offer a one-tap trim. ──
  const firstMonth = bill.oneTimeOnDelivery + bill.perMonth
  const overBudget = monthlyCap > 0 ? Math.max(0, firstMonth - monthlyCap) : 0
  const trimIds = useMemo(() => planTrim(creatives, overBudget), [creatives, overBudget])
  // Only offer "Trim to fit" when dropping content actually closes the gap. An overage
  // driven by recurring ads (perMonth) can't be trimmed away by removing one-time pieces —
  // offering a trim there would just lose content and stay over budget.
  const trimSaves = useMemo(() => { const set = new Set(trimIds); return creatives.reduce((s, c) => s + (c.id && set.has(c.id) ? c.cents / 100 : 0), 0) }, [creatives, trimIds])
  const canTrim = overBudget > 0 && trimSaves >= overBudget
  // The armed state of the two-tap over-budget ship confirm; re-arms whenever the overage changes.
  const [overOk, setOverOk] = useState(false)
  useEffect(() => { setOverOk(false) }, [overBudget])

  const groups = useMemo(() => {
    const byWeek = new Map<number, Beat[]>(); for (const b of beats) { const a = byWeek.get(b.week) ?? []; a.push(b); byWeek.set(b.week, a) }
    const weeks = [...byWeek.keys()].sort((a, b) => a - b)
    return weeks.map((w, i) => {
      const ps = byWeek.get(w)!.slice().sort((a, b) => (dateById.get(a.id)?.postISO ?? '').localeCompare(dateById.get(b.id)?.postISO ?? ''))
      return { week: w, tagline: ongoing ? '' : weekTagline(i, weeks.length), starts: ps.map((p) => dateById.get(p.id)?.postLabel).filter(Boolean)[0], pieces: ps }
    })
  }, [beats, dateById, ongoing])
  const flatOrder = useMemo(() => { const m = new Map<string, number>(); [...beats].sort((a, b) => (dateById.get(a.id)?.postISO ?? '').localeCompare(dateById.get(b.id)?.postISO ?? '')).forEach((b, i) => m.set(b.id, i)); return m }, [beats, dateById])
  const nextUpId = useMemo(() => { let best: string | null = null, iso: string | null = null; for (const b of beats) { const d = dateById.get(b.id)?.postISO; if (d && (!iso || d < iso)) { iso = d; best = b.id } } return best }, [beats, dateById])

  // ── The Walk: pieces grouped by act (notice → try → back), each sorted by date. Only acts that
  // have pieces render. Used for ongoing programs (the funnel story); dated events keep their week
  // countdown, where the weeks themselves carry the meaning. ──
  const actGroups = useMemo(() => {
    const by = new Map<Act, Beat[]>()
    for (const b of beats) { const a = by.get(b.act) ?? []; a.push(b); by.set(b.act, a) }
    return ACT_ORDER.filter((a) => (by.get(a)?.length ?? 0) > 0).map((a) => ({
      act: a, pieces: by.get(a)!.slice().sort((x, y) => (dateById.get(x.id)?.postISO ?? '').localeCompare(dateById.get(y.id)?.postISO ?? '')),
    }))
  }, [beats, dateById])
  const useWalk = ongoing && actGroups.length >= 2

  // ── mutations ──
  function updateBeat(id: string, patch: Partial<Beat>) { setBeats((arr) => arr.map((b) => (b.id === id ? { ...b, ...patch, edited: b.edited || patch.featuring !== undefined || patch.offer !== undefined } : b))) }
  function swapBeat(id: string, type: string) { setBeats((arr) => arr.map((b) => (b.id === id ? { ...b, type, channel: (CHANNELS_FOR_TYPE[type] ?? ['social'])[0], baseLabel: '' } : b))) }
  function removeBeat(id: string) { setBeats((arr) => { const b = arr.find((x) => x.id === id); if (b) { undoRef.current = [b]; setUndo([b]) } return arr.filter((x) => x.id !== id) }); setSheet(null) }
  function restoreUndo() { const bs = undoRef.current; if (bs.length) setBeats((arr) => [...arr, ...bs]); undoRef.current = []; setUndo(null) }
  function trimToFit(ids: string[]) { if (!ids.length) return; const set = new Set(ids); setBeats((arr) => { const removed = arr.filter((x) => set.has(x.id)); if (removed.length) { undoRef.current = removed; setUndo(removed) } return arr.filter((x) => !set.has(x.id)) }) }
  function addPiece(week: number) { const id = `b${Date.now()}`; setBeats((arr) => [...arr, { id, type: 'reel', channel: 'reels', week, featuring: planFeat, offer: planOffer, note: '', baseLabel: '', edited: false, act: 'notice' }]); setSheet({ kind: 'piece', id }) }
  function addPieceToAct(act: Act) { const id = `b${Date.now()}`; const week = act === 'notice' ? 1 : act === 'try' ? 2 : 3; setBeats((arr) => [...arr, { id, type: 'reel', channel: 'reels', week, featuring: planFeat, offer: planOffer, note: '', baseLabel: '', edited: false, act }]); setSheet({ kind: 'piece', id }) }
  function applyPlanField(field: 'feature' | 'offer', val: string) {
    if (field === 'feature') { setPlanFeat(val); setBeats((arr) => arr.map((b) => (b.edited || !['reel', 'photo', 'story', 'post'].includes(b.type) ? b : { ...b, featuring: val }))) }
    else { setPlanOffer(val); setBeats((arr) => arr.map((b) => (b.edited ? b : { ...b, offer: val }))) }
    setSheet(null)
  }
  function setService(producer: PieceProducer) { const keys = picker?.keys ?? []; setChoices((c) => { const n = { ...c }; for (const k of keys) n[k] = producer; return n }); setPicker(null) }
  const openPiece = (c: { key: string; type: string; producer: PieceProducer; creatorName?: string }) => setPicker({ type: c.type, keys: [c.key], producer: c.producer, creatorName: c.creatorName })
  function confirm() { const movesOut = visibleMoves.map((m) => (serviceQty[m.serviceId] != null ? { ...m, qty: serviceQty[m.serviceId] } : m)); onConfirm({ draft: { ...initial, items, ...(isSystem ? { moves: movesOut } : {}), brief: initial.brief ? { ...initial.brief, contentBeats: editedBeats } : initial.brief }, producerChoices: choices, receipt: { creatives, services, bill } }) }

  const hero = GOAL_HERO[initial.goalKey ?? ''] ?? HERO_FALLBACK
  const audienceLabels = (initial.brief?.audienceIds ?? []).map((id) => AUD_LABEL[id]).filter(Boolean)
  const activeBeat = sheet?.kind === 'piece' ? beats.find((b) => b.id === sheet.id) ?? null : null

  // ── paid amplification: a ONE-TIME boost attached to a specific piece (beat.boost) and/or the
  // ongoing $/mo local-ads MANAGEMENT retainer (the paid-ads service line) are surfaced separately. ──
  const adsService = services.find((s) => /ads/i.test(s.serviceId ?? '') || /\bads?\b/i.test(`${s.plain || ''} ${s.name || ''}`))
  const hasManagedAds = !!adsService
  const sortedByDate = useMemo(() => [...beats].sort((a, b) => (dateById.get(a.id)?.postISO ?? '').localeCompare(dateById.get(b.id)?.postISO ?? '')), [beats, dateById])
  const firstISO = sortedByDate.length ? dateById.get(sortedByDate[0].id)?.postISO : undefined
  const lastISO = sortedByDate.length ? dateById.get(sortedByDate[sortedByDate.length - 1].id)?.postISO : undefined
  // The boosted piece is marked on the beat itself, so the boost is part of the actual content.
  const boostBeat = beats.find((b) => b.boost) ?? null
  const boostId = boostBeat?.id ?? null
  const boostISO = boostId ? dateById.get(boostId)?.postISO : undefined
  const addDaysISO = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const boostRange = boostISO ? `${fmtDay(boostISO)}–${fmtDay(addDaysISO(boostISO, 7))}` : ''
  const windowLabel = firstISO && lastISO && firstISO !== lastISO ? `${fmtDay(firstISO)}–${fmtDay(lastISO)}` : null
  const adsWindowLabel = ongoing ? 'every month' : (windowLabel ?? '')

  // ── SYSTEM plan (e.g. win first visits): the plan is a staged set of catalog SERVICES (initial.moves),
  // not content beats. We render the four stages; each move's price comes from its line item(s). ──
  const isSystem = !!(initial.moves && initial.moves.length)
  const visibleMoves = [...(initial.moves ?? []), ...addedMoves.map((a) => ({ serviceId: a.serviceId, stage: a.stage, role: '' }))].filter((m) => !removed.has(m.serviceId))
  const moveCount = visibleMoves.length
  const spineCount = visibleMoves.filter((m) => spineIds.has(m.serviceId)).length
  // The nights goal targets a NAMED slow night. The madlib captures it (vals.days), but it was never
  // surfaced — so the choice read as an invisible default. Surface it as a binding anchor (the decision
  // gate): show the chosen night, or prompt to pick one when it is genuinely unset.
  const slowNight = (() => {
    if (itemId !== 'nights') return null
    const raw = vals.days ?? vals.subject
    const label = Array.isArray(raw) ? raw.filter(Boolean).join(' & ') : typeof raw === 'string' ? raw.trim() : ''
    return label || null
  })()
  const moveInfo = (sid: string) => {
    const ls = items.filter((it) => it.serviceId === sid)
    const plain = ls[0]?.plain || ls[0]?.name || sid
    // The concrete deliverable in plain words — what we actually make/do (a reel, 4 Google posts, a
    // profile rebuild). Content services itemize into pieces with a per-piece price (price ÷ qty);
    // single-deliverable services fall back to the catalog description.
    const svc = serviceById(sid)
    const deliverable = svc?.desc || ls[0]?.does || ''
    const basePcs = svc?.pieces ?? []
    // Reflect the owner's quantity tune in what the card shows. Adjustable services are single-unit,
    // so override that one piece's count; the per-piece figure comes from the rate card at the new count.
    const qOverride = serviceQty[sid]
    const tuned = qOverride != null && isQtyAdjustable(sid) && basePcs.length === 1
    const pcs = tuned ? [{ label: basePcs[0].label, qty: qOverride }] : basePcs
    const totalQty = pcs.reduce((s, p) => s + p.qty, 0)
    const eachBase = svc && totalQty > 0 ? Math.round(svc.prices[0].amount / totalQty) : 0
    const each = tuned ? (eachAtQty(sid, qOverride) ?? eachBase) : eachBase
    const pieces = pcs.map((p) => ({ label: p.label, qty: p.qty, each }))
    // Spell the charge out per line so "what's being charged" is unambiguous: one-time vs monthly vs
    // per-event. A multi-price service (setup + monthly) shows both.
    const charge = ls.map((l) => l.cadence.kind === 'recurring'
      ? `${money(l.price)}/mo`
      : l.cadence.kind === 'per-occurrence' ? `${money(l.price)} per ${l.cadence.unit}` : `${money(l.price)} once`).join(' + ')
    const kinds = new Set(ls.map((l) => l.cadence.kind))
    const billing = kinds.has('recurring') && kinds.has('one-time') ? 'setup once, then monthly'
      : kinds.has('recurring') ? 'billed monthly'
      : kinds.has('per-occurrence') ? 'charged per use' : 'one-time, on delivery'
    // A compact price for the simple card (the full charge wording lives in the detail sheet).
    const priceShort = ls.map((l) => l.cadence.kind === 'recurring' ? `${money(l.price)}/mo` : l.cadence.kind === 'per-occurrence' ? `${money(l.price)}/ea` : money(l.price)).join(' + ')
    // The concrete "what's included" list the owner is paying for (from the catalog deliverables).
    const included = svc?.deliverables?.included ?? []
    return { plain, deliverable, pieces, charge, billing, priceShort, included }
  }
  const systemStages = (initial.stages ?? []).map((s) => ({ stage: s.stage, title: s.title, sub: s.sub, moves: visibleMoves.filter((m) => m.stage === s.stage) })).filter((s) => s.moves.length)
  function removeMove(id: string, name: string) { setRemoved((s) => new Set(s).add(id)); setRemovedToast({ id, name }) }
  function restoreMove(id: string) { setRemoved((s) => { const n = new Set(s); n.delete(id); return n }); setRemovedToast(null) }
  function addMove(serviceId: string, stage: string) {
    setRemoved((s) => { const n = new Set(s); n.delete(serviceId); return n })  // re-adding a removed one just un-removes it
    const inBase = (initial.moves ?? []).some((m) => m.serviceId === serviceId)
    if (!inBase) setAddedMoves((a) => (a.some((m) => m.serviceId === serviceId) ? a : [...a, { serviceId, stage }]))
    setAddPicker(null)
  }

  // ── buildStops(): the one adapter that turns whichever branch is active into an ordered Stop[].
  // Both branches render through the SAME loop below, collapsing three layouts into one. ──
  const stops = useMemo<Stop[]>(() => {
    const out: Stop[] = [{ kind: 'hero' }]
    const ampDesc = `Puts a little ad budget behind it so ${audienceLabels[0] || 'new locals nearby'} see it, not just your followers. You only pay the ad cost.`

    if (isSystem) {
      systemStages.forEach((sg, i) => {
        out.push({
          kind: 'chapter', id: `st-${sg.stage}`, badge: i + 1, tone: toneAt(i), title: sg.title,
          caption: i === 0 ? (lead || sg.sub) : sg.sub,
          think: i === 0 && moveCount > spineCount && spineCount > 0
            ? `New to this? Start with the ${spineCount} marked “Start here”. The rest add reach as your budget allows.`
            : undefined,
        })
        sg.moves.forEach((m) => {
          const info = moveInfo(m.serviceId)
          const rate = VOLUME_RATES[m.serviceId]
          const curQty = serviceQty[m.serviceId] ?? rate?.base.qty ?? 0
          out.push({
            kind: 'card', id: `mv-${m.serviceId}`,
            node: {
              variant: 'service', Icon: moveIcon(m.serviceId), title: info.plain, deliverable: info.deliverable,
              priceShort: info.priceShort, spine: spineIds.has(m.serviceId), included: info.included, pieces: info.pieces,
              channels: SERVICE_CHANNELS[m.serviceId],
              qty: rate ? {
                value: curQty, min: rate.min, max: rate.max, step: rate.step,
                unit: rate.unit, unitPlural: rate.unitPlural,
                total: priceForQty(m.serviceId, curQty) ?? rate.base.price,
                each: eachAtQty(m.serviceId, curQty) ?? 0,
                cadence: rate.cadence, tiered: !!rate.tiers,
                onChange: (n: number) => setServiceQtyFor(m.serviceId, n),
              } : undefined,
              onOpen: () => setSheet({ kind: 'service', id: m.serviceId }),
              onRemove: () => removeMove(m.serviceId, info.plain),
            },
          })
        })
        out.push({ kind: 'add', id: `add-${sg.stage}`, label: 'Add a service here', onAdd: () => setAddPicker(sg.stage) })
      })
    } else {
      if (initial.leadMove) {
        out.push({ kind: 'chapter', id: 'setup', badge: 'setup', tone: TONE_BACK, title: 'First, the groundwork', caption: initial.leadMove.because })
        out.push({
          kind: 'card', id: 'lead-move',
          node: {
            variant: 'service', Icon: Flag, title: initial.leadMove.title, deliverable: initial.leadMove.because,
            priceShort: `${money(initial.leadMove.price)}${initial.leadMove.cadence.kind === 'recurring' ? (initial.leadMove.cadence.every === 'weekly' ? '/wk' : '/mo') : ''}`,
            spine: false, included: [], onOpen: noop, readOnly: true,
          },
        })
      }

      const pushBeat = (b: Beat, key: string) => {
        const tint = tintFor(b.type)
        out.push({
          kind: 'card', id: `bt-${b.id}-${key}`,
          node: {
            variant: 'content', b, d: dateById.get(b.id), tint, Icon: TYPE_ICON[b.type], photo: dishPhoto(b.featuring),
            nextUp: b.id === nextUpId, needsPhoto: !!(b.type === 'photo' && b.featuring && !dishPhoto(b.featuring)),
            idx: flatOrder.get(b.id) ?? 0, ongoing, onOpen: () => setSheet({ kind: 'piece', id: b.id }),
          },
        })
        if (boostBeat && b.id === boostId) {
          out.push({ kind: 'amp', id: `boost-${b.id}`, Icon: Rocket, title: `Boost the ${nounFor(boostBeat.type)}`, dateLabel: boostRange, desc: ampDesc })
        }
      }

      if (useWalk) {
        actGroups.forEach((g, gi) => {
          const meta = ACT_META[g.act]; const isBack = g.act === 'back'
          out.push({
            kind: 'chapter', id: `act-${g.act}`, badge: isBack ? 'arrival' : gi + 1,
            tone: g.act === 'notice' ? TONE_NOTICE : g.act === 'try' ? TONE_TRY : TONE_BACK,
            title: meta.title, caption: meta.sub, think: meta.think,
          })
          g.pieces.forEach((b) => pushBeat(b, g.act))
          out.push({ kind: 'add', id: `add-${g.act}`, label: 'Add a piece here', onAdd: () => addPieceToAct(g.act) })
        })
      } else {
        groups.forEach((g, gi) => {
          out.push({
            kind: 'chapter', id: `wk-${g.week}`, badge: gi + 1, tone: toneAt(g.week - 1),
            title: `Week ${g.week}`, caption: [g.tagline, g.starts ? `starts ${g.starts}` : ''].filter(Boolean).join(' · ') || undefined,
          })
          g.pieces.forEach((b) => pushBeat(b, `w${g.week}`))
          out.push({ kind: 'add', id: `add-w${g.week}`, label: `Add a piece to Week ${g.week}`, onAdd: () => addPiece(g.week) })
        })
      }

      if (hasManagedAds) {
        out.push({ kind: 'chapter', id: 'all-campaign', badge: 'arrival', tone: TONE_BACK, title: 'All campaign', caption: 'Paid reach, running the whole time' })
        out.push({
          kind: 'amp', id: 'managed-ads', Icon: Megaphone, title: 'Local ads, running the whole time', dateLabel: adsWindowLabel,
          priceLabel: adsService ? `${money(adsService.price)}/mo` : undefined,
          desc: `Keeps your ${planFeat || 'food'}${planOffer ? ` + ${planOffer}` : ''} in front of nearby diners the whole time.`,
        })
      }
    }

    out.push({ kind: 'endcap', id: 'endcap' })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSystem, systemStages, spineIds, lead, moveCount, spineCount, initial, useWalk, actGroups, groups, dateById, flatOrder, nextUpId, ongoing, boostBeat, boostId, boostRange, audienceLabels, hasManagedAds, adsService, adsWindowLabel, planFeat, planOffer, items, serviceQty])

  const stopCount = stops.filter((s) => s.kind === 'card').length
  const durationLabel = isSystem ? `${moveCount} service${moveCount === 1 ? '' : 's'}` : (windowLabel || `${groups.length} week${groups.length === 1 ? '' : 's'}`)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bg, display: 'flex', justifyContent: 'center' }}>
      <style>{KEYFRAMES}</style>
      <div style={{ width: '100%', maxWidth: 480, background: step === 'review' ? PAPER : '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 15px', borderBottom: `1px solid ${C.line}`, background: step === 'review' ? 'rgba(255,255,255,0.6)' : '#fff' }}>
          <button onClick={step === 'summary' ? () => setStep('review') : onBack} aria-label="Back" style={{ display: 'inline-flex', background: 'none', border: 'none', color: C.mute, cursor: 'pointer', padding: 0 }}><ChevronLeft size={22} /></button>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: '.04em', color: C.mute }}>{step === 'review' ? 'YOUR PLAN' : 'ORDER SUMMARY'}</div>
          <div style={{ fontSize: 11, color: C.faint }}>Step {step === 'review' ? 2 : 3} of 3</div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', padding: step === 'review' ? '0 0 22px' : '16px 16px 22px' }}>
          {step === 'review' ? (
            <PathReview
              hero={hero} initialName={initial.name} audienceLabels={audienceLabels} outcome={outcome ?? null}
              isSystem={isSystem} estimateMode={sched.mode === 'estimate'} heldAds={!!initial.heldAds} adsOverride={adsOverride}
              onRunAds={() => setAdsOverride(true)} onUndoAds={() => setAdsOverride(false)}
              planFeat={planFeat} planOffer={planOffer} onEditFeat={() => setSheet({ kind: 'field', field: 'feature' })} onEditOffer={() => setSheet({ kind: 'field', field: 'offer' })}
              nights={itemId === 'nights'} slowNight={slowNight} onPickNight={onBack}
              stops={stops} stopCount={stopCount} durationLabel={durationLabel} lead={lead ?? null} ongoing={ongoing}
              busy={!!busy} confirming={confirming}
            />
          ) : (
            <Summary creatives={creatives} services={services} bill={bill} sched={sched} doneSetup={doneSetup} onPiece={openPiece} monthlyCap={monthlyCap} firstMonth={firstMonth} overBudget={overBudget} canTrim={canTrim} onTrim={() => trimToFit(trimIds)} />
          )}
        </div>

        {/* sticky footer */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '11px 16px calc(12px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          {error && <div style={{ color: C.red, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{error}</div>}
          {step === 'review' && <div style={{ textAlign: 'center', fontSize: 11, color: C.faint, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><LockOpen size={11} /> You&rsquo;ll approve every piece before it posts. Nothing&rsquo;s locked yet.</div>}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontSize: 11, color: C.faint, lineHeight: 1.3 }}>{step === 'review' ? 'Your plan, charged as it ships' : 'Charged per piece, on delivery'}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{money(bill.oneTimeOnDelivery)}{bill.perMonth > 0 ? <span style={{ fontSize: 13, fontWeight: 400, color: C.mute }}> · {money(bill.perMonth)}/mo</span> : null}</span>
          </div>
          {step === 'review' ? (
            <button
              onClick={() => { if (busy) return; setStep('summary') }}
              style={{ ...ctaBtn, boxShadow: `${E3}, 0 0 22px -6px rgba(22,163,74,.5)` }}
            >Continue <ChevronRight size={17} /></button>
          ) : (
            // Over budget is a TWO-TAP ship: the first tap arms the button with the real overage, so
            // the owner never commits past their stated number without seeing it on the button itself.
            <button
              onClick={() => { if (busy) return; if (Math.round(overBudget) >= 1 && !overOk) { setOverOk(true); return } confirm() }}
              disabled={busy}
              style={{ ...ctaBtn, opacity: busy ? 0.7 : 1, ...(Math.round(overBudget) >= 1 && overOk ? { background: 'linear-gradient(135deg,#e0a13a,#b9760f)' } : {}) }}
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />} {Math.round(overBudget) >= 1 && overOk ? `Ship anyway, ${money(overBudget)} over budget` : 'Confirm & start campaign'}
            </button>
          )}
        </div>

        {undo && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 96, background: C.ink, color: '#fff', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, zIndex: 80 }}>
            <span style={{ flex: 1 }}>{undo.length === 1 ? 'Piece removed' : `${undo.length} pieces removed`}</span>
            <button onClick={restoreUndo} style={{ background: 'none', border: 'none', color: C.green, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Undo</button>
            <button onClick={() => setUndo(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, opacity: 0.6 }}><X size={15} /></button>
          </div>
        )}

        {removedToast && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 96, background: C.ink, color: '#fff', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, zIndex: 80 }}>
            <span style={{ flex: 1 }}>Removed {removedToast.name}</span>
            <button onClick={() => restoreMove(removedToast.id)} style={{ background: 'none', border: 'none', color: C.green, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Undo</button>
            <button onClick={() => setRemovedToast(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, opacity: 0.6 }}><X size={15} /></button>
          </div>
        )}

        {activeBeat && (
          <CustomizeSheet beat={activeBeat} date={dateById.get(activeBeat.id)} anchorISO={sched.anchorISO ?? todayISO} dishes={dishes} photoMap={photoMap} planOffer={planOffer}
            onUpdate={(patch) => updateBeat(activeBeat.id, patch)} onSwap={(t) => swapBeat(activeBeat.id, t)} onRemove={() => removeBeat(activeBeat.id)} onClose={() => setSheet(null)} />
        )}
        {sheet?.kind === 'service' && (() => {
          const sid = sheet.id; const info = moveInfo(sid)
          return <ServiceSheet Icon={moveIcon(sid)} plain={info.plain} deliverable={info.deliverable} pieces={info.pieces} charge={info.charge} billing={info.billing} included={info.included} spine={spineIds.has(sid)} onRemove={() => { removeMove(sid, info.plain); setSheet(null) }} onClose={() => setSheet(null)} />
        })()}
        {sheet?.kind === 'field' && (
          <FieldSheet field={sheet.field} value={sheet.field === 'feature' ? planFeat : planOffer} dishes={dishes} onDone={(v) => applyPlanField(sheet.field, v)} onClose={() => setSheet(null)} />
        )}
        {picker && (
          <ServicePicker type={picker.type} producer={picker.producer} creatorName={picker.creatorName} onPick={(prod) => setService(prod)} onClose={() => setPicker(null)} />
        )}
        {addPicker && (
          <AddServiceSheet usedIds={new Set(visibleMoves.map((m) => m.serviceId))} onAdd={(sid) => addMove(sid, addPicker)} onClose={() => setAddPicker(null)} />
        )}
      </div>
    </div>
  )
}

const ctaBtn: React.CSSProperties = { width: '100%', background: BRAND_GRAD, color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: E3 }
const coverPill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 99, padding: '6px 11px', fontSize: 13, color: C.ink, cursor: 'pointer' }

/* ── The whole Step-2 review: the editorial hero, then The Path (one spine, one render loop) ── */
function PathReview({
  hero, initialName, audienceLabels, outcome, isSystem, estimateMode, heldAds, adsOverride, onRunAds, onUndoAds,
  planFeat, planOffer, onEditFeat, onEditOffer, nights, slowNight, onPickNight, stops, stopCount, durationLabel, lead, ongoing, busy, confirming,
}: {
  hero: { label: string; Icon: ComponentType<{ size?: number; color?: string }>; bg: string; fg: string }
  initialName: string; audienceLabels: string[]; outcome?: string | null; isSystem: boolean; estimateMode: boolean
  heldAds: boolean; adsOverride: boolean; onRunAds: () => void; onUndoAds: () => void
  planFeat: string; planOffer: string; onEditFeat: () => void; onEditOffer: () => void
  nights: boolean; slowNight: string | null; onPickNight: () => void
  stops: Stop[]; stopCount: number; durationLabel: string; lead?: string | null; ongoing: boolean; busy: boolean; confirming: boolean
}) {
  // Cards reveal via the self-contained `.pf-card` CSS entrance (reduced-motion shows them statically),
  // so visibility never depends on JS or an observer firing.
  const wrapRef = useRef<HTMLDivElement>(null)

  // The GOAL_HERO bg values are already muted pastels, so all four goals read as one calm family
  // over the glow; the brand green bloom (second radial) ties them together.
  const heroSub = isSystem
    ? 'A complete plan. Groundwork first, then the work that moves your goal.'
    : (outcome ? <><span style={{ color: C.mute }}>Built to</span> <b style={{ fontWeight: 600 }}>{outcome}</b></> : null)

  const showSkeleton = busy
  // Group the flat stops into collapsible sections: each chapter owns the stops that follow it
  // (its cards, amps, and add-row) until the next chapter. Hero + end-cap render on their own.
  const sections: { chapter: Extract<Stop, { kind: 'chapter' }>; children: Stop[] }[] = []
  let endcapStop: Stop | null = null
  for (const s of stops) {
    if (s.kind === 'hero') continue
    if (s.kind === 'endcap') { endcapStop = s; continue }
    if (s.kind === 'chapter') sections.push({ chapter: s, children: [] })
    else if (sections.length) sections[sections.length - 1].children.push(s)
  }

  return (
    <>
      {/* glow — the star of the hero; no glass over it */}
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 360, pointerEvents: 'none', background: `radial-gradient(120% 80% at 85% 0%, ${hero.bg}, ${PAPER} 62%), radial-gradient(80% 60% at 20% 30%, rgba(22,163,74,0.10), transparent 70%)` }} />

      {/* zone 1 — masthead */}
      <div className="pf-up" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '20px 18px 0' }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: hero.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `${INSET_HI}, 0 6px 16px -8px ${hero.fg}55` }}><hero.Icon size={19} color={hero.fg} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.mute }}>YOUR PLAN{audienceLabels.length ? ` · for ${audienceLabels[0]}` : ''}</span>
      </div>

      {/* zone 2 — standfirst */}
      <div className="pf-up" style={{ position: 'relative', padding: '0 18px', animationDelay: '.04s' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1.04, color: C.ink, marginTop: 12 }}>{initialName}</div>
        {heroSub && <div style={{ fontSize: 13, color: C.mute, marginTop: 8, lineHeight: 1.45 }}>{heroSub}</div>}
        <div style={{ marginTop: 8, fontSize: 13, color: C.mute }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{sections.length}</span> step{sections.length === 1 ? '' : 's'}{!isSystem && durationLabel ? <> <span style={{ color: C.faint }}>·</span> {durationLabel}</> : ''} <span style={{ color: C.faint }}>· tap any for details</span>
        </div>
        {estimateMode && <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>Dates lock when you pick a start.</div>}
        {!isSystem && lead && <div style={{ fontSize: 13, color: C.mute, marginTop: 10, borderLeft: `3px solid ${C.greenDk}`, paddingLeft: 10, lineHeight: 1.45 }}>{lead}</div>}
      </div>

      {/* zone 3 — the set-up bar (the only glass in the hero) */}
      {(isSystem ? nights : true) && (
        <div className="pf-up" style={{ position: 'relative', margin: '14px 14px 0', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 16, boxShadow: E2, padding: '12px 13px', animationDelay: '.08s' }}>
          {isSystem ? (
            <button onClick={onPickNight} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: '#fff', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={17} color={slowNight ? C.greenDk : '#b07d1e'} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: slowNight ? C.greenDk : '#b07d1e' }}>{slowNight ? 'Your slow night' : 'Pick your slow night'}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 1 }}>{slowNight ?? 'Choose the night this plan fills'}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: slowNight ? C.greenDk : '#b07d1e', flexShrink: 0 }}>{slowNight ? 'Change' : 'Choose'} ›</span>
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button onClick={onEditFeat} style={coverPill}><span style={{ color: C.mute }}>Dish</span> <b style={{ fontWeight: 600 }}>{planFeat || 'add one'}</b> <Pencil size={12} color={C.faint} /></button>
                <button onClick={onEditOffer} style={coverPill}><span style={{ color: C.mute }}>Special</span> <b style={{ fontWeight: 600 }}>{planOffer || 'add one'}</b> <Pencil size={12} color={C.faint} /></button>
              </div>
            </>
          )}
        </div>
      )}
      {!isSystem && <div style={{ position: 'relative', fontSize: 11, color: C.faint, margin: '7px 16px 0' }}>Change these once. We update every piece you haven&rsquo;t touched by hand.</div>}

      {/* the ads-held note — one calm line, no beige fill */}
      {heldAds && (
        <div style={{ position: 'relative', margin: '12px 14px 0', background: PAPER, borderLeft: '4px solid #b07d1e', border: '1px solid #efe2c8', borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 9 }}>
          <Megaphone size={16} color="#b07d1e" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>We held paid ads for now. Until your setup is done, paying to bring new people in tends to backfire, so the plan does that first.</div>
            {adsOverride
              ? <button onClick={onUndoAds} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: C.greenDk, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 99, padding: '5px 12px', cursor: 'pointer' }}>Ads on · use recommended</button>
              : <button onClick={onRunAds} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#b07d1e', background: '#fff', border: '1px solid #efe2c8', borderRadius: 99, padding: '5px 12px', cursor: 'pointer' }}>Run ads anyway</button>}
          </div>
        </div>
      )}

      {ongoing && <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.greenDk, margin: '14px 0 0 26px' }}><Repeat size={13} /> A fresh set every month. Here&rsquo;s a typical one.</div>}

      {/* THE PATH — one relative wrapper, one spine, one render loop */}
      <div ref={wrapRef} style={{ position: 'relative', padding: '8px 14px 0' }}>
        {/* the spine: render ONCE, behind everything */}
        <span className="pf-spine" style={{ position: 'absolute', left: 23, top: 0, bottom: 0, width: 7, filter: 'blur(7px)', opacity: 0.45, background: 'linear-gradient(180deg,#16a34a,#9fe1cb)', pointerEvents: 'none' }} />
        <span className="pf-spine" style={{ position: 'absolute', left: 25, top: 0, bottom: 0, width: 3, background: SPINE_GRAD, pointerEvents: 'none' }} />
        {/* the approve charge — a brighter rail sweeping down on confirm */}
        {confirming && <span className="pf-charge" style={{ position: 'absolute', left: 24, top: 0, bottom: 0, width: 5, background: 'linear-gradient(180deg,#16a34a,#16a34a)', filter: 'blur(2px)', boxShadow: '0 0 14px rgba(22,163,74,.7)', pointerEvents: 'none' }} />}

        {showSkeleton ? <PathSkeleton /> : sections.length === 0 ? (
          <div className="pf-up" style={{ position: 'relative', paddingLeft: 44, marginTop: 18 }}>
            <span style={{ position: 'absolute', left: 11, top: 2, width: 30, height: 30, borderRadius: 15, background: TONE_BACK.bg, color: TONE_BACK.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 4px ${PAPER}` }}><Sparkles size={15} /></span>
            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #ededf0', borderRadius: 16, boxShadow: E1, padding: 14, fontSize: 13, color: C.mute }}>Your plan is being shaped.</div>
          </div>
        ) : (
          <>
            {sections.map((sec, si) => {
              const hasSpine = sec.children.some((c) => c.kind === 'card' && c.node.variant === 'service' && c.node.spine)
              return (
                <div key={sec.chapter.id}>
                  <ChapterStation chapter={sec.chapter} hasSpine={hasSpine} delay={si * 0.05} />
                  {sec.children.map((c, ci) => <PathStop key={'id' in c ? c.id : `c${ci}`} stop={c} confirming={confirming} stopCount={stopCount} durationLabel={durationLabel} delay={ci * 0.04} />)}
                </div>
              )
            })}
            {endcapStop && <PathStop stop={endcapStop} confirming={confirming} stopCount={stopCount} durationLabel={durationLabel} delay={0} />}
          </>
        )}
      </div>
    </>
  )
}

/* ── One stop on The Path. Switches on kind; nothing forks above this. ── */
function PathStop({ stop, confirming, stopCount, durationLabel, delay }: { stop: Stop; confirming: boolean; stopCount: number; durationLabel: string; delay: number }) {
  if (stop.kind === 'hero' || stop.kind === 'chapter') return null // chapters render via the section loop
  if (stop.kind === 'card') return <PathCard node={stop.node} delay={delay} />
  if (stop.kind === 'amp') return <AmpCard Icon={stop.Icon} title={stop.title} dateLabel={stop.dateLabel} desc={stop.desc} priceLabel={stop.priceLabel} />
  if (stop.kind === 'add') return (
    <div style={{ position: 'relative', paddingLeft: 44, marginBottom: 14 }}>
      <span style={{ position: 'absolute', left: 19, top: 14, width: 12, height: 12, borderRadius: 6, border: `1.5px dashed ${C.faint}`, background: PAPER }} />
      <button onClick={stop.onAdd} style={{ width: '100%', border: `1px dashed ${C.line}`, borderRadius: 13, padding: 10, background: 'none', color: C.mute, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, WebkitTapHighlightColor: 'transparent' }}><Plus size={13} /> {stop.label}</button>
    </div>
  )
  if (stop.kind === 'endcap') return <EndCap confirming={confirming} stopCount={stopCount} durationLabel={durationLabel} />
  return null
}

/* ── A chapter station: a tone-warmed numbered marker on the rail — a light label that groups the
 *    service rows beneath it. The services themselves are the expandable items, not the station. ── */
function ChapterStation({ chapter, hasSpine, delay }: { chapter: Extract<Stop, { kind: 'chapter' }>; hasSpine: boolean; delay: number }) {
  const { badge, tone, title, caption } = chapter
  const arrival = badge === 'arrival'
  return (
    <div className="pf-up" style={{ position: 'relative', paddingLeft: 44, marginTop: 18, animationDelay: `${delay}s` }}>
      <span style={{ position: 'absolute', left: arrival ? 10 : 11, top: 0, width: arrival ? 32 : 30, height: arrival ? 32 : 30, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: arrival ? BRAND_GRAD : tone.bg, color: arrival ? '#fff' : tone.fg, boxShadow: arrival ? `0 0 0 4px ${PAPER}, 0 0 16px rgba(22,163,74,.45)` : `0 0 0 4px ${PAPER}, 0 0 14px ${tone.fg}55` }}>
        {badge === 'setup' ? <Flag size={14} /> : arrival ? <DoorOpen size={15} /> : badge}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.3px', color: C.ink }}>{title}</span>
        {hasSpine && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: 'rgba(34,150,90,0.10)', border: '1px solid rgba(34,150,90,0.22)', borderRadius: 6, padding: '1px 5px' }}>Start here</span>}
      </div>
      {caption && <div style={{ fontSize: 13, color: C.mute, marginTop: 2, lineHeight: 1.45 }}>{caption}</div>}
    </div>
  )
}

/* ── PathCard: ONE card for a service OR a content piece, hung off the shared rail ── */
function PathCard({ node, delay }: { node: CardNode; delay: number }) {
  const isContent = node.variant === 'content'
  const [open, setOpen] = useState(false)
  const dotColor = isContent ? node.tint.fg : C.greenDk
  const pulse = isContent && node.nextUp
  const readOnly = !isContent && !!node.readOnly
  // Compact "header" row = a short name + a price (service) or date (content). Detail expands on tap.
  const title = isContent
    ? `${cap(nounFor(node.b.type))}${node.b.featuring ? ` · ${node.b.featuring}` : node.b.offer ? ` · ${node.b.offer}` : ''}`
    : node.title
  const right = isContent ? (node.d?.postLabel ?? '') : node.priceShort
  const detail = isContent ? beatLabel(node.b) : node.deliverable
  // The concrete deliverable, straight from the catalog: "8 × short video (reel + TikTok)", "30 × edited food photo".
  const pieceLine = !isContent && node.pieces && node.pieces.length ? node.pieces.map((p) => `${p.qty} × ${p.label}`).join('  ·  ') : ''
  // Channels: prefer the structured per-service map (exhaustive); fall back to scanning the catalog copy.
  const channels = isContent
    ? channelsFrom(channelPhrase(node.b.type, node.b.channel))
    : (node.channels ?? channelsFrom(`${node.deliverable} ${(node.included ?? []).join(' ')}`))
  const sub = isContent
    ? (channels.length ? `Posts to ${channels.join(' + ')}` : '')
    : (pieceLine || (channels.length ? channels.join(' · ') : ''))
  return (
    <div className="pf-card" style={{ position: 'relative', paddingLeft: 44 }}>
      <span className={pulse ? 'pf-pulse' : undefined} style={{ position: 'absolute', left: 21, top: 21, width: 11, height: 11, borderRadius: 6, background: dotColor, boxShadow: `0 0 0 4px ${PAPER}, 0 0 10px ${dotColor}55` }} />
      <div className="pf-up" style={{ background: '#fff', border: '1px solid #ededf0', borderRadius: 14, boxShadow: `${E1}, ${INSET_HI}`, padding: '10px 12px', marginBottom: 9, animationDelay: `${delay}s` }}>
        {/* the compact row — the service/piece "header"; tap to expand */}
        <button onClick={() => { if (!readOnly) setOpen((o) => !o) }} disabled={readOnly} style={{ display: 'flex', gap: 11, alignItems: 'center', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: readOnly ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          {isContent ? <ContentTile node={node} /> : (
            <span style={{ width: 34, height: 34, borderRadius: 10, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: INSET_HI }}><node.Icon size={17} strokeWidth={1.75} color={C.mute} /></span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}{!isContent && node.spine ? <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: 'rgba(34,150,90,0.10)', border: '1px solid rgba(34,150,90,0.22)', borderRadius: 6, padding: '1px 5px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>Start here</span> : null}
            </span>
            {sub && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
          </span>
          {right && <span style={{ fontSize: isContent ? 12 : 13.5, fontWeight: isContent ? 500 : 700, color: isContent ? C.mute : C.greenDk, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{right}</span>}
          {!readOnly && <ChevronDown size={17} color={C.faint} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
        </button>
        {/* expanded detail — "learn more" */}
        {open && !readOnly && (
          <div className="pf-text" style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #f0f0f2' }}>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{detail}</div>
            {channels.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                {channels.map((ch) => <span key={ch} style={{ fontSize: 11, fontWeight: 600, color: C.greenDk, background: C.greenSoft, borderRadius: 7, padding: '2px 8px' }}>{ch}</span>)}
              </div>
            )}
            {!isContent && node.included && node.included.length > 0 && (
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {node.included.slice(0, 6).map((it, i) => <li key={i} style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.4, paddingLeft: 14, position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: C.greenDk }}>•</span>{it}</li>)}
              </ul>
            )}
            {isContent && node.needsPhoto && <div style={{ fontSize: 12, color: '#b07d1e', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8 }}><Camera size={13} /> A menu photo makes this stronger.</div>}
            {!isContent && node.qty && (
              <div style={{ marginTop: 12, padding: '10px 11px', background: C.bg, borderRadius: 11, border: `1px solid ${C.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>How many {node.qty.unitPlural}?</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => node.qty!.onChange(node.qty!.value - node.qty!.step)} disabled={node.qty.value <= node.qty.min} aria-label={`Fewer ${node.qty.unitPlural}`}
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: node.qty.value <= node.qty.min ? C.bg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: node.qty.value <= node.qty.min ? 'default' : 'pointer', color: node.qty.value <= node.qty.min ? C.faint : C.greenDk, flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}><Minus size={15} /></button>
                    <span style={{ minWidth: 32, textAlign: 'center', fontSize: 15, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{node.qty.value}</span>
                    <button onClick={() => node.qty!.onChange(node.qty!.value + node.qty!.step)} disabled={node.qty.value >= node.qty.max} aria-label={`More ${node.qty.unitPlural}`}
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: node.qty.value >= node.qty.max ? C.bg : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: node.qty.value >= node.qty.max ? 'default' : 'pointer', color: node.qty.value >= node.qty.max ? C.faint : C.greenDk, flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}><Plus size={15} /></button>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: C.faint }}>{node.qty.tiered ? `about ${money(node.qty.each)} each at this count` : `${money(node.qty.each)} each`}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.greenDk, fontVariantNumeric: 'tabular-nums' }}>{money(node.qty.total)}{node.qty.cadence === 'monthly' ? '/mo' : node.qty.cadence === 'per-occurrence' ? ' total' : ' once'}</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 11 }}>
              <span style={{ fontSize: 11.5, color: C.faint }}>{isContent ? (node.d ? `Goes out ${node.d.postLabel}` : '') : node.priceShort}</span>
              {isContent
                ? <button onClick={node.onOpen} style={{ fontSize: 12.5, fontWeight: 600, color: C.greenDk, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 99, padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>Customize <ChevronRight size={13} /></button>
                : node.onRemove ? <button onClick={node.onRemove} style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Trash2 size={13} /> Remove</button> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── The media tile for a content card: the owner's real dish photo, or a type-tinted icon ── */
function ContentTile({ node }: { node: Extract<CardNode, { variant: 'content' }> }) {
  const { photo, tint, Icon } = node
  return (
    <span style={{ width: 40, height: 40, borderRadius: 12, background: photo ? '#eee' : tint.tint, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `${INSET_HI}, 0 4px 10px -6px ${tint.fg}66` }}>
      {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (Icon ? <Icon size={18} color={tint.fg} /> : null)}
      {photo && Icon && <span style={{ position: 'absolute', right: -1, bottom: -1, width: 17, height: 17, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}><Icon size={10} color={tint.fg} /></span>}
    </span>
  )
}

/* ── The end-cap: the rail resolves into the total, with the wax-seal stamp on approve ── */
function EndCap({ confirming, stopCount, durationLabel }: { confirming: boolean; stopCount: number; durationLabel: string }) {
  return (
    <div className="pf-up" style={{ position: 'relative', paddingLeft: 44, marginTop: 18, marginBottom: 8 }}>
      <span style={{ position: 'absolute', left: 10, top: 0, width: 32, height: 32, borderRadius: 16, background: BRAND_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 4px ${PAPER}, 0 0 16px rgba(22,163,74,.45)` }}><Flag size={15} color="#fff" /></span>
      <div style={{ background: 'rgba(255,255,255,0.66)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid #d8efe5', borderRadius: 16, boxShadow: E1, padding: '13px 14px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.ink }}>That&rsquo;s the plan</div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>{stopCount} stop{stopCount === 1 ? '' : 's'} over {durationLabel}. See the price next, then approve each piece before it posts.</div>
        {confirming && <span className="pf-stamp" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%) rotate(-4deg)', fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '.08em', color: '#0f6e56', border: '2px solid #0f6e56', borderRadius: 8, padding: '3px 9px', textShadow: '0 1px 0 rgba(255,255,255,.7)', opacity: 0.92 }}>APPROVED</span>}
      </div>
    </div>
  )
}

/* ── Loading skeleton: shimmer stations + a few shimmer cards, never a blank column ── */
function PathSkeleton() {
  return (
    <>
      {[0, 1].map((s) => (
        <div key={s} style={{ position: 'relative', paddingLeft: 44, marginTop: 18 }}>
          <span className="pf-shim" style={{ position: 'absolute', left: 11, top: 0, width: 30, height: 30, borderRadius: 15, boxShadow: `0 0 0 4px ${PAPER}` }} />
          <div className="pf-shim" style={{ height: 16, width: '46%', borderRadius: 6 }} />
          <div className="pf-shim" style={{ height: 11, width: '64%', borderRadius: 6, marginTop: 7 }} />
          {[0, 1].map((c) => (
            <div key={c} style={{ position: 'relative', paddingLeft: 0, marginTop: 12 }}>
              <div className="pf-shim" style={{ height: 70, borderRadius: 16 }} />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/* ── A service detail sheet — the deliverable, what's included, the charge, and Remove (one place) ── */
function ServiceSheet({ Icon, plain, deliverable, pieces, charge, billing, included, spine, onRemove, onClose }: {
  Icon: LucideIcon; plain: string; deliverable: string; pieces?: { label: string; qty: number; each: number }[]; charge: string; billing: string; included?: string[]; spine?: boolean; onRemove: () => void; onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(20,20,25,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '88dvh' }}>
        <div style={{ flexShrink: 0, paddingTop: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e4', margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px 12px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: INSET_HI }}><Icon size={19} strokeWidth={1.75} color={C.mute} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink }}>{plain}{spine ? <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: 'rgba(34,150,90,0.10)', border: '1px solid rgba(34,150,90,0.22)', borderRadius: 6, padding: '1px 5px', verticalAlign: 'middle' }}>Start here</span> : null}</div>
              <div style={{ fontSize: 13, color: C.greenDk, fontWeight: 700, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{charge} <span style={{ color: C.faint, fontWeight: 400 }}>· {billing}</span></div>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 18px 8px' }}>
          {deliverable && <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{deliverable}</div>}
          {pieces && pieces.length ? <div style={{ fontSize: 13, color: C.greenDk, marginTop: 9 }}>{pieces.map((p) => `${p.qty} × ${p.label} (~${money(p.each)} ea)`).join('  ·  ')}</div> : null}
          {included && included.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>What&rsquo;s included</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {included.map((it, i) => <li key={i} style={{ fontSize: 13, color: C.mute, lineHeight: 1.4, paddingLeft: 15, position: 'relative' }}><span style={{ position: 'absolute', left: 0, color: C.greenDk }}>•</span>{it}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 10, alignItems: 'center', background: '#fff' }}>
          <button onClick={onRemove} aria-label={`Remove ${plain}`} style={{ width: 44, height: 44, borderRadius: 11, border: `1px solid ${C.line}`, background: 'none', color: C.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={17} /></button>
          <button onClick={onClose} style={{ flex: 1, background: BRAND_GRAD, color: '#fff', border: 'none', borderRadius: 13, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  )
}
/* ── A paid-amplification item, hung off the shared rail like any card ── */
function AmpCard({ Icon, title, dateLabel, desc, priceLabel }: { Icon: ComponentType<{ size?: number; color?: string }>; title: string; dateLabel: string; desc: string; priceLabel?: string }) {
  return (
    <div className="pf-card" style={{ position: 'relative', paddingLeft: 44 }}>
      <span style={{ position: 'absolute', left: 21, top: 24, width: 12, height: 12, borderRadius: 6, background: C.greenDk, boxShadow: `0 0 0 4px ${PAPER}, 0 0 10px ${C.greenDk}55` }} />
      <div className="pf-up" style={{ background: 'linear-gradient(135deg,#f3fbf8,#eafaf2)', border: '1px solid #cdebdf', borderRadius: 16, boxShadow: `${E1}, ${INSET_HI}`, padding: 13, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: BRAND_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: INSET_HI }}><Icon size={18} color="#fff" /></span>
          <div style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: '#0f6e56', background: '#cdebdf', borderRadius: 99, padding: '2px 7px', marginBottom: 3 }}>PAID REACH</span><div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.28 }}>{title}</div></div>
          {(dateLabel || priceLabel) && <div style={{ textAlign: 'right', flexShrink: 0 }}>{dateLabel && <div style={{ fontSize: 13, fontWeight: 600, color: C.greenDk, fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</div>}{priceLabel && <div style={{ fontSize: 13, fontWeight: 700, color: C.greenDk, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{priceLabel}</div>}</div>}
        </div>
        <div style={{ fontSize: 13, color: '#2e7d63', marginTop: 7, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  )
}

/* ── Add-a-service sheet: every catalog service not already in the plan, tap to add to a stage ── */
function AddServiceSheet({ usedIds, onAdd, onClose }: { usedIds: Set<string>; onAdd: (serviceId: string) => void; onClose: () => void }) {
  const groups = addableByStage(usedIds)
  const priceOf = (s: PricedService) => { const { price, cadence } = cadenceOf(s); return cadence.kind === 'recurring' ? `${money(price)}/mo` : cadence.kind === 'per-occurrence' ? `${money(price)} ea` : money(price) }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(20,20,25,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '88dvh' }}>
        <div style={{ flexShrink: 0, paddingTop: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e4', margin: '0 auto 8px' }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, padding: '0 18px 3px' }}>Add a service</div>
          <div style={{ fontSize: 12, color: C.mute, padding: '0 18px 8px' }}>Anything here can join your plan — tap to add it.</div>
        </div>
        <div style={{ overflowY: 'auto', padding: '2px 14px calc(14px + env(safe-area-inset-bottom))' }}>
          {groups.map((g) => (
            <div key={g.stage} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, margin: '6px 2px 6px' }}>{g.stage}</div>
              {g.services.map((s) => {
                const I = moveIcon(s.id); const plain = serviceToLines(s, 'x')[0]?.plain || s.name
                return (
                  <button key={s.id} onClick={() => onAdd(s.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid #ededf0', borderRadius: 12, padding: '10px 12px', marginBottom: 7, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I size={16} color={C.mute} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{plain}</div>
                      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.desc}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.greenDk, flexShrink: 0, whiteSpace: 'nowrap' }}>{priceOf(s)}</span>
                    <Plus size={15} color={C.greenDk} style={{ flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── The piece "hero" — the only media that can exist pre-production ── */
function PieceHero({ type, dish, photo, verb }: { type: string; dish: string; photo?: string; verb: string }) {
  const t = tintFor(type); const Icon = TYPE_ICON[type]
  return (
    <div style={{ height: 156, borderRadius: 16, position: 'relative', overflow: 'hidden', background: photo ? '#2a2018' : t.tint }}>
      {photo
        ? <img src={photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon ? <Icon size={42} color={t.fg} style={{ opacity: 0.5 }} /> : null}</div>}
      {photo && type === 'reel' && <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', width: 46, height: 46, borderRadius: 23, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon ? <Icon size={20} color={t.fg} /> : null}</div>}
      {photo && <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 58, background: 'linear-gradient(transparent, rgba(20,12,6,0.62))' }} />}
      <div style={{ position: 'absolute', left: 13, bottom: 11, color: photo ? '#fff' : t.fg }}>
        <div style={{ fontSize: 10, opacity: photo ? 0.85 : 0.7 }}>{verb}</div>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{dish || 'Your campaign'}</div>
      </div>
      {photo && <div style={{ position: 'absolute', right: 10, top: 10, background: 'rgba(255,255,255,0.9)', color: C.mute, borderRadius: 99, padding: '2px 8px', fontSize: 9 }}>your menu photo</div>}
    </div>
  )
}

const ASK_LABEL: Record<string, Partial<Record<AskKind, string>>> = {
  reel: { dish: 'Which dish should it show?', footage: 'How do we get the footage?' },
  photo: { dish: 'Which dish should we show?', footage: "Where's the photo coming from?" },
  story: { dishOrMoment: 'A dish, or a moment?' },
  post: { subject: "What's this post about?" },
  email: { message: "What's the main thing to tell people?", button: 'What should the button do?' },
  sms: { message: "What's the one thing the text should say?" },
}

/* ── The "Plan Card" — a glance-and-confirm editor for one piece ── */
function CustomizeSheet({ beat, date, anchorISO, dishes, photoMap, planOffer, onUpdate, onSwap, onRemove, onClose }: {
  beat: Beat; date?: { postLabel: string; relLabel?: string; postISO?: string }; anchorISO: string; dishes: string[]; photoMap: Map<string, string>; planOffer: string
  onUpdate: (patch: Partial<Beat>) => void; onSwap: (type: string) => void; onRemove: () => void; onClose: () => void
}) {
  const cfg = TYPE_CONFIG[beat.type] ?? TYPE_CONFIG.post
  const t = tintFor(beat.type); const Icon = TYPE_ICON[beat.type]
  const [pick, setPick] = useState<null | 'channel' | 'date'>(null)
  const photo = beat.featuring ? photoMap.get(beat.featuring.trim().toLowerCase()) : undefined
  const validChannels = CHANNELS_FOR_TYPE[beat.type] ?? ['social']
  const dateLabel = date?.postLabel ?? `Week ${beat.week}`
  const dayISO = beat.dateISO || date?.postISO || ''
  const isSend = beat.type === 'email' || beat.type === 'sms'
  const footage = beat.footage ?? 'photo'
  const subjectKind = beat.subjectKind ?? 'dish'
  const buttonTarget = beat.buttonTarget ?? 'menu'
  const labels = ASK_LABEL[beat.type] ?? {}
  const hookPills = Array.from(new Set([beat.offer, planOffer].filter(Boolean)))
  const needsPhoto = beat.type === 'photo' && !photo
  // Owner picks an exact day → store it + recompute which week it falls in (for plan grouping).
  const setDay = (iso: string) => {
    if (!iso) return
    const a = new Date(`${anchorISO}T00:00:00Z`).getTime(); const d = new Date(`${iso}T00:00:00Z`).getTime()
    const week = Math.max(1, Math.floor((d - a) / (7 * 86400000)) + 1)
    onUpdate({ dateISO: iso, week })
  }
  const todayISO = new Date().toISOString().slice(0, 10)

  const dishChips = (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Array.from(new Set([beat.featuring, ...dishes].filter(Boolean))).map((dn) => { const ph = photoMap.get(dn.trim().toLowerCase()); const on = beat.featuring === dn; return (
          <button key={dn} onClick={() => onUpdate({ featuring: dn })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: ph ? '3px 12px 3px 3px' : '6px 12px', fontSize: 12, fontWeight: on ? 500 : 400, cursor: 'pointer', border: on ? 'none' : `1px solid ${C.line}`, background: on ? C.green : '#fff', color: on ? '#fff' : C.ink }}>{ph && <img src={ph} alt="" style={{ width: 22, height: 22, borderRadius: 7, objectFit: 'cover' }} />}{dn}</button>
        ) })}
      </div>
      <input value={beat.featuring} onChange={(e) => onUpdate({ featuring: e.target.value })} placeholder="or type one" style={sheetInput} />
    </>
  )

  function renderAsk(kind: AskKind) {
    if (kind === 'dish') return <Field key={kind} label={labels.dish ?? 'Which dish?'}>{dishChips}</Field>
    if (kind === 'footage') return (
      <Field key={kind} label={labels.footage ?? 'How do we get it?'}>
        <div style={{ display: 'flex', gap: 7 }}>
          {FOOTAGE.map((f) => { const on = footage === f.key; return (
            <button key={f.key} onClick={() => onUpdate({ footage: f.key })} style={{ flex: 1, textAlign: 'center', border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', borderRadius: 12, padding: '9px 4px', cursor: 'pointer' }}><f.Icon size={17} color={on ? C.greenDk : C.mute} /><div style={{ fontSize: 10.5, fontWeight: on ? 600 : 400, color: on ? C.greenDk : C.mute, marginTop: 3 }}>{f.label}</div></button>
          ) })}
        </div>
      </Field>
    )
    if (kind === 'dishOrMoment') return (
      <Field key={kind} label={labels.dishOrMoment ?? 'A dish, or a moment?'}>
        {dishChips}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{MOMENTS.map((m) => <Pill key={m} on={beat.featuring === m} onClick={() => onUpdate({ featuring: m })}>{m}</Pill>)}</div>
      </Field>
    )
    if (kind === 'subject') return (
      <Field key={kind} label={labels.subject ?? "What's it about?"}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{POST_SUBJECTS.map((s) => <Pill key={s.key} on={subjectKind === s.key} onClick={() => onUpdate({ subjectKind: s.key })}>{s.label}</Pill>)}</div>
        {subjectKind === 'dish' && <div style={{ marginTop: 9 }}>{dishChips}</div>}
        {subjectKind === 'deal' && <input value={beat.offer} onChange={(e) => onUpdate({ offer: e.target.value })} placeholder="e.g. $3 off this week" style={sheetInput} />}
        {subjectKind === 'news' && <input value={beat.newsLine ?? ''} onChange={(e) => onUpdate({ newsLine: e.target.value })} placeholder="What's new? e.g. new hours, an event" style={sheetInput} />}
      </Field>
    )
    if (kind === 'message') return (
      <Field key={kind} label={labels.message ?? 'What should it say?'}>
        <input value={beat.messagePoint ?? ''} onChange={(e) => onUpdate({ messagePoint: e.target.value })} placeholder={isSend && beat.type === 'sms' ? 'e.g. Tonight only: 2-for-1 birria' : 'e.g. our new spring menu'} style={{ ...sheetInput, marginTop: 0 }} />
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>A few words is plenty — we write the rest.</div>
      </Field>
    )
    if (kind === 'button') return (
      <Field key={kind} label={labels.button ?? 'What should the button do?'}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{BUTTON_OPTS.map((b) => <Pill key={b.key} on={buttonTarget === b.key} onClick={() => onUpdate({ buttonTarget: b.key })}>{b.label}</Pill>)}</div>
      </Field>
    )
    return null
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(20,20,25,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, height: 'calc(100dvh - 22px)', background: '#fff', borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ flexShrink: 0, paddingTop: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e4', margin: '0 auto 8px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 14px 11px' }}>
            <button onClick={onClose} aria-label="Back" style={{ display: 'inline-flex', background: 'none', border: 'none', color: C.mute, cursor: 'pointer', padding: 0 }}><ChevronDown size={22} /></button>
            <div style={{ flex: 1, fontSize: 11.5, color: C.faint }}>{cap(cfg.word)} · Week {beat.week}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.tint, color: t.fg, borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 600 }}>{Icon ? <Icon size={14} /> : null}{cfg.word}</span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 18px' }}>
          <PieceHero type={beat.type} dish={beat.featuring} photo={photo} verb={cfg.verb} />

          <div style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 500, margin: '14px 0 0' }}>{beatLabel(beat)}</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Smartphone size={13} color={C.faint} />
            {validChannels.length > 1 ? <ChipBtn label={channelLabel(beat.channel, beat.type)} onTap={() => setPick('channel')} /> : <span>{channelPhrase(beat.type, beat.channel)}</span>}
            <span style={{ color: C.faint }}>·</span>
            <span>Goes out <ChipBtn label={dateLabel} onTap={() => setPick('date')} /></span>
          </div>
          {beat.offer && !isSend && subjectKind !== 'deal' && <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Plus your deal: <span style={{ color: C.ink }}>{beat.offer}</span></div>}

          <div style={{ textAlign: 'center', fontSize: 11.5, color: C.faint, margin: '13px 0', lineHeight: 1.45, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Sparkles size={13} /> Our team writes the words and makes it. You just say what to feature.</div>

          {cfg.asks.map(renderAsk)}

          {cfg.helper && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: needsPhoto ? '#FAEEDA' : '#f6f6f7', borderRadius: 12, padding: '10px 12px', marginTop: 14 }}>
              {needsPhoto ? <Camera size={17} color="#854f0b" /> : <Smartphone size={17} color={C.mute} />}
              <div style={{ flex: 1, fontSize: 11.5, color: needsPhoto ? '#854f0b' : C.mute, lineHeight: 1.35 }}>{needsPhoto ? 'A quick photo from you helps' : <>Got a {cfg.helper === 'clip' ? 'clip' : 'photo'} on your phone? <span style={{ color: C.faint }}>— helps us match your real food</span></>}</div>
              <button onClick={() => onUpdate({ hasReference: !beat.hasReference })} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: beat.hasReference ? C.greenDk : C.green, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{beat.hasReference ? <><Check size={13} /> Added</> : 'Add'}</button>
            </div>
          )}

          <Field label="Anything we should know?">
            <textarea value={beat.note} onChange={(e) => onUpdate({ note: e.target.value })} placeholder="Must-haves, things to avoid, the vibe… (optional)" rows={2} style={{ ...sheetInput, marginTop: 0, minHeight: 56, resize: 'vertical', lineHeight: 1.45 }} />
          </Field>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Change the kind of piece</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {SWAP_TYPES.map((ty) => { const I = TYPE_ICON[ty]; const on = beat.type === ty; const tt = tintFor(ty); return (
                <button key={ty} onClick={() => onSwap(ty)} aria-label={ty} style={{ flex: 1, minWidth: 0, padding: '9px 0', borderRadius: 11, border: `1px solid ${on ? tt.fg : C.line}`, background: on ? tt.tint : '#fff', color: on ? tt.fg : C.mute, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 9 }}>{I ? <I size={16} /> : null}{nounFor(ty)}</button>
              ) })}
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 10, alignItems: 'center', background: '#fff' }}>
          <button onClick={onRemove} aria-label="Remove this piece" style={{ width: 44, height: 44, borderRadius: 11, border: `1px solid ${C.line}`, background: 'none', color: C.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={17} /></button>
          <button onClick={onClose} style={{ flex: 1, background: GRAD, color: '#fff', border: 'none', borderRadius: 13, padding: 13, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Done</button>
        </div>

        {pick && (
          <div onClick={() => setPick(null)} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(20,20,25,0.4)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: '#fff', borderRadius: '20px 20px 0 0', padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e4', margin: '4px auto 12px' }} />
              {pick === 'channel' && <Field label="Where should it run?"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{validChannels.map((ch) => <Pill key={ch} on={beat.channel === ch} onClick={() => { onUpdate({ channel: ch }); setPick(null) }}>{channelLabel(ch, beat.type)}</Pill>)}</div></Field>}
              {pick === 'date' && <Field label="When should it go out?"><input type="date" value={dayISO} min={todayISO} onChange={(e) => { setDay(e.target.value); setPick(null) }} style={{ ...sheetInput, marginTop: 0 }} /><div style={{ fontSize: 10.5, color: C.faint, marginTop: 7 }}>Pick any day — we&rsquo;ll have the draft ready a few days before.</div></Field>}
              <button onClick={() => setPick(null)} style={{ width: '100%', marginTop: 12, background: C.bg, border: 'none', borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 13.5, color: C.ink, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Plan-wide field sheet (Featuring / The hook) ──────────── */
function FieldSheet({ field, value, dishes, onDone, onClose }: { field: 'feature' | 'offer'; value: string; dishes: string[]; onDone: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value)
  const opts = field === 'feature' ? Array.from(new Set([value, ...dishes].filter(Boolean))) : Array.from(new Set([value].filter(Boolean)))
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(20,20,25,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '22px 22px 0 0', padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e4', margin: '4px auto 14px' }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{field === 'feature' ? 'What dish are you featuring?' : "What's the special or deal?"}</div>
        <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 12 }}>Sets it across every piece you haven&rsquo;t changed by hand.</div>
        {opts.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 11 }}>{opts.map((o) => <Pill key={o} on={v === o} onClick={() => setV(o)}>{o}</Pill>)}</div>}
        <input value={v} onChange={(e) => setV(e.target.value)} autoFocus placeholder={field === 'feature' ? 'e.g. Birria Tacos' : 'e.g. 2-for-1 Tuesdays'} style={{ ...sheetInput, marginTop: 0 }} />
        <button onClick={() => onDone(v.trim())} style={{ width: '100%', marginTop: 14, background: GRAD, color: '#fff', border: 'none', borderRadius: 13, padding: 13, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Done</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 15 }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>{label}</div>{children}</div>
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: on ? 500 : 400, cursor: 'pointer', border: on ? 'none' : `1px solid ${C.line}`, background: on ? C.green : '#fff', color: on ? '#fff' : C.ink }}>{children}</button>
}
function ChipBtn({ label, onTap }: { label: string; onTap: () => void }) {
  return <button onClick={onTap} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.greenDk, borderBottom: '1.5px solid #9fe1cb', font: 'inherit' }}>{label}</button>
}
const sheetInput: React.CSSProperties = { width: '100%', marginTop: 8, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px', fontSize: 13, outline: 'none' }

/* ── Order summary (step 3) — the price ─────────────────────── */
function Summary({ creatives, services, bill, sched, doneSetup, onPiece, monthlyCap, firstMonth, overBudget, canTrim, onTrim }: {
  creatives: { key: string; type: string; label: string; producer: PieceProducer; cents: number; creatorName?: string }[]
  services: LineItem[]
  bill: BillingSummary
  sched: ReturnType<typeof deriveSchedule>
  doneSetup?: string[]
  onPiece: (c: { key: string; type: string; producer: PieceProducer; creatorName?: string }) => void
  monthlyCap: number
  firstMonth: number
  overBudget: number
  canTrim: boolean
  onTrim: () => void
}) {
  // Honest go-live estimate (critical path over the plan's services + content). Drives the timeline headline.
  const go = aggregateGoLive(services, sched, new Date().toISOString().slice(0, 10), { doneSetupIds: doneSetup ?? [] })
  // Condensed pricing: group the lines into Setup (one-time) / Content (per-piece) / Monthly (recurring),
  // each a collapsible subtotal. The three always sum to the same bill (setup + content = oneTime; monthly = perMonth).
  const [openG, setOpenG] = useState<Record<string, boolean>>({})
  const setupSvc = services.filter((it) => it.cadence.kind === 'one-time')
  const monthlySvc = services.filter((it) => it.cadence.kind === 'recurring')
  const perOccSvc = services.filter((it) => it.cadence.kind === 'per-occurrence')
  const setupTotal = setupSvc.reduce((s, it) => s + lineTotal(it), 0)
  const contentTotal = Math.max(0, bill.oneTimeOnDelivery - setupTotal)
  const priceGroups = ([
    setupSvc.length ? { key: 'setup', Icon: Flag, fg: '#3f72c4', label: 'Setup', sub: 'One-time, to get you live', total: setupTotal, suffix: '' } : null,
    (creatives.length || perOccSvc.length) ? { key: 'content', Icon: Sparkles, fg: C.greenDk, label: 'Content we make', sub: 'Charged as each piece ships', total: contentTotal, suffix: '' } : null,
    monthlySvc.length ? { key: 'monthly', Icon: Repeat, fg: C.mute, label: 'Every month', sub: 'Ongoing, pause anytime', total: bill.perMonth, suffix: '/mo' } : null,
  ].filter(Boolean) as { key: string; Icon: LucideIcon; fg: string; label: string; sub: string; total: number; suffix: string }[])
  return (
    <div>
      <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, margin: '0 0 3px' }}>What you&rsquo;re getting</div>
      <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 11 }}>Grouped by setup, the content we make, and what runs each month. Tap a group to see every piece.</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {priceGroups.map((g, gi) => {
          const isOpen = openG[g.key] ?? false
          return (
            <div key={g.key} style={{ borderTop: gi === 0 ? 'none' : `1px solid ${C.line}` }}>
              <button onClick={() => setOpenG((o) => ({ ...o, [g.key]: !isOpen }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: `${g.fg}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><g.Icon size={15} color={g.fg} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{g.sub}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: g.total === 0 ? C.green : C.ink, flexShrink: 0 }}>{g.total === 0 ? 'Free' : `${money(g.total)}${g.suffix}`}</span>
                <ChevronDown size={16} color={C.faint} style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {isOpen && (
                <div style={{ background: '#fafafa', borderTop: `1px solid ${C.line}` }}>
                  {g.key === 'content' && creatives.map((c) => { const tt = tintFor(c.type); const Icon = TYPE_ICON[c.type]; return (
                    <button key={c.key} onClick={() => onPiece(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px 9px 26px', background: 'transparent', border: 'none', borderTop: `1px solid ${C.line}`, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 25, height: 25, borderRadius: 7, background: tt.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icon ? <Icon size={13} color={tt.fg} /> : null}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>{c.label}</div>
                        <div style={{ fontSize: 10.5, color: C.greenDk, marginTop: 1 }}>Made by {serviceLabel(c.producer, c.creatorName)} ›</div>
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: c.cents === 0 ? C.green : C.ink, flexShrink: 0 }}>{c.cents === 0 ? 'Free' : money(c.cents / 100)}</span>
                    </button>
                  ) })}
                  {(g.key === 'setup' ? setupSvc : g.key === 'monthly' ? monthlySvc : perOccSvc).map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px 10px 26px', borderTop: `1px solid ${C.line}` }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.plain || it.name}</div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, flexShrink: 0 }}>{it.cadence.kind === 'recurring' ? `${money(it.price)}/mo` : money(lineTotal(it))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {bill.optedOutCount > 0 && (
          <div style={{ borderTop: `1px dashed ${C.line}`, padding: '8px 13px', fontSize: 11, color: C.faint }}>
            You skipped {bill.optedOutCount} {bill.optedOutCount === 1 ? 'piece' : 'pieces'}, saved {money(bill.optedOutSaved)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px', borderTop: `1.5px solid ${C.line}`, fontSize: 13.5, fontWeight: 700 }}>
          <span>Total</span><span>{money(bill.oneTimeOnDelivery)}{bill.perMonth > 0 ? ` + ${money(bill.perMonth)}/mo` : ''}</span>
        </div>
      </div>
      {monthlyCap > 0 && (Math.round(overBudget) >= 1 ? (
        <div style={{ background: '#FEF4E4', border: '1px solid #F3D7A4', borderRadius: 12, padding: '12px 13px', margin: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#8A5A12', marginBottom: 4 }}><Wallet size={14} /> A little over your budget</div>
          <div style={{ fontSize: 12, color: '#8A5A12', lineHeight: 1.5 }}>This plan runs about <b style={{ fontWeight: 700 }}>{money(firstMonth)}</b>, around <b style={{ fontWeight: 700 }}>{money(overBudget)}</b> over your {money(monthlyCap)}/mo budget.</div>
          {canTrim
            ? <button onClick={onTrim} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E3B873', color: '#8A5A12', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Scissors size={13} /> Trim to fit</button>
            : <div style={{ marginTop: 7, fontSize: 11, color: '#A07A3A' }}>{bill.perMonth > monthlyCap ? `Most of this is ads at ${money(bill.perMonth)}/mo. Lower the ads or shorten the run to fit.` : `Trimming the extras won't fully fit this. You can ship at this price, or ask your team to resize it.`}</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.greenDk, margin: '11px 2px 0' }}><Check size={13} /> Fits your {money(monthlyCap)}/mo budget{firstMonth < monthlyCap ? `, ${money(monthlyCap - firstMonth)} to spare` : ''}.</div>
      ))}
      <div style={{ background: C.greenSoft, borderRadius: 12, padding: '11px 13px', margin: '12px 0', fontSize: 12, color: C.greenDk, lineHeight: 1.5 }}>
        <b style={{ fontWeight: 700 }}>Nothing upfront.</b> Each piece is charged only when it ships, after you approve it.{bill.perMonth > 0 ? ' Ads bill monthly while the campaign runs — pause anytime.' : ''}
      </div>
      {(() => {
        const posts = [...sched.beats].sort((a, b) => a.postISO.localeCompare(b.postISO))
        const firstDraft = sched.firstDraftISO
        const hasShots = sched.beats.some((b) => ['reel', 'photo', 'story'].includes(b.type))
        // Prep happens before the first post, but never in the past — if the owner picked
        // a date too soon for the full runway, these floor to today ("we start right away").
        const tISO = new Date().toISOString().slice(0, 10)
        const floor = (iso: string) => (iso < tISO ? tISO : iso)
        type Row = { iso: string; kind: 'setup' | 'work' | 'draft' | 'post'; title: string; sub?: string }
        const rows: Row[] = []
        // Setup runs in parallel with creative; show its own deadline ("Setup done · by <date>").
        if (go.setup.present && go.setup.byISO) {
          const more = go.setup.services.length > 2 ? ` +${go.setup.services.length - 2} more` : ''
          rows.push({ iso: go.setup.byISO, kind: 'setup', title: 'Setup done', sub: go.setup.services.slice(0, 2).join(', ') + more })
        }
        if (firstDraft) {
          rows.push({ iso: floor(shiftISO(firstDraft, -3)), kind: 'work', title: hasShots ? 'Photo + video shoot' : 'We start creating', sub: hasShots ? 'We come film + shoot your dishes' : 'We write and design everything' })
          rows.push({ iso: floor(firstDraft), kind: 'draft', title: 'First drafts for your OK', sub: 'Approve before anything goes live' })
        }
        for (const b of posts) rows.push({ iso: b.postISO, kind: 'post', title: b.label || cap(b.type) })
        // Services-only (system) plans carry no content beats, so the only dated row would be "Setup done".
        // Fill the timeline with ESTIMATED milestones from the go-live estimate so it tells the whole story.
        if (!firstDraft && go.hasGoLive) {
          rows.push({ iso: addBusinessDays(tISO, 2), kind: 'work', title: 'We get to work', sub: go.creative.present ? 'Setup, plus filming and creating your content' : 'Getting your foundations set up' })
          if (go.creative.present) rows.push({ iso: addBusinessDays(tISO, Math.max(go.daysToFirstPost.max, 1)), kind: 'post', title: 'First content goes live', sub: 'Estimate, give or take a few days' })
        }
        rows.sort((a, b) => a.iso.localeCompare(b.iso))
        const color = (k: Row['kind']) => (k === 'setup' ? '#3f72c4' : k === 'work' ? '#ba7517' : k === 'draft' ? C.greenDk : C.green)
        const hasDate = sched.mode === 'start' || sched.mode === 'event'
        const headline = hasDate && sched.firstPostLabel ? `First posts ${sched.firstPostLabel}`
          : go.hasGoLive && go.phrase ? `Live in ${go.phrase}`
          : go.phrase ? `Starts in ${go.phrase}`
          : ''
        const headlineSub = sched.tooSoon ? 'That date is tight for the full build — we start right away.'
          : sched.mode === 'estimate' ? 'Estimate. Lock a start date to confirm.'
          : sched.mode === 'none' && go.hasGoLive ? 'Rough estimate — we confirm exact dates once you start.'
          : ''
        return (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 14px 4px' }}>
            {headline && (
              <div style={{ marginBottom: 13 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>{headline}</div>
                {headlineSub && <div style={{ fontSize: 11.5, color: sched.tooSoon ? '#b8860b' : C.mute, marginTop: 2 }}>{headlineSub}</div>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 12 }}><CalendarDays size={12} /> How it rolls out</div>
            {rows.length === 0 ? <div style={{ fontSize: 12, color: C.faint, paddingBottom: 10 }}>Dates set once it&rsquo;s live.</div> : rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: color(r.kind), width: 42, flexShrink: 0, textAlign: 'right', paddingTop: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtDay(r.iso)}</span>
                <div style={{ width: 12, flexShrink: 0, position: 'relative' }}>
                  {i < rows.length - 1 && <span style={{ position: 'absolute', left: 5, top: 8, bottom: -14, width: 2, background: C.line }} />}
                  <span style={{ position: 'absolute', left: r.kind === 'post' ? 2 : 0, top: r.kind === 'post' ? 4 : 2, width: r.kind === 'post' ? 8 : 12, height: r.kind === 'post' ? 8 : 12, borderRadius: 8, background: color(r.kind), boxShadow: `0 0 0 3px #fff` }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 13 }}>
                  <div style={{ fontSize: 12.5, fontWeight: r.kind === 'post' ? 400 : 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  {r.sub && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{r.sub}</div>}
                </div>
              </div>
            ))}
            {go.recurring.present && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 10 }}>
                <span style={{ width: 42, flexShrink: 0 }} />
                <div style={{ width: 12, flexShrink: 0, display: 'flex', justifyContent: 'center' }}><Repeat size={11} color={C.faint} /></div>
                <div style={{ fontSize: 12, color: C.mute }}>Then runs every month</div>
              </div>
            )}
          </div>
        )
      })()}
      <div style={{ fontSize: 11, color: C.mute, margin: '13px 2px 0', lineHeight: 1.5 }}><b style={{ color: C.ink, fontWeight: 600 }}>When you start:</b> every piece lands in Content for your approval first. Nothing posts until you say so.{sched.firstDraftLabel ? ` First draft around ${sched.firstDraftLabel}.` : ''}{go.gates.filter((g) => !/approval/i.test(g)).slice(0, 2).map((g) => ` ${g}`).join('')}</div>
    </div>
  )
}
