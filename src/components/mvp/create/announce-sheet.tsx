'use client'
/**
 * ANNOUNCE SOMETHING (owner 2026-09-16, rebuilt 2026-09-17 "let's build it"): a popup, five
 * screens after the pick, and every screen is a default the owner can flip.
 * ==========================================================================================
 *   pick     What is the news? Eight kinds, drawn.
 *   1 facts  Only what that kind needs. A photo or video up top, optional.
 *   2 picture How should it look? Use my photo · make a graphic · make a video · book a shoot ·
 *            add to my next shoot · words only. Priced from the same sheets the desk charges.
 *   3 where  Post it (the connected accounts, Google, a Story). Also update (menus, ordering,
 *            the regulars, a table tent, the team). When (as soon as it is ready · by a date ·
 *            an exact time), the repeat, Boost.
 *   4 words  Written from the answers, in the owner's voice, shown as the post will look.
 *            The call to action, a second language, the staff card.
 *   5 plan   A dated list of what happens and what it costs. One button.
 *   done     The plan as it really landed, from the server, with what to do next.
 *
 * The fastest path is still three taps: photo in hand, post now, done. Nothing here promises a
 * rail that does not exist: /api/dashboard/announce lands every line on the real thing.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, ChevronRight, Loader2, X, Plus, Copy } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, DRAW_CSS, type Scene } from './drawings'
import AnnounceMenu, { itemCents, type MenuMe, type MenuPrices } from './announce-menu'
import type { ItemId, ItemPick } from '@/lib/plan/suggest'
import { BrandOrMark } from '../mvp-insights'

export type AnnounceKind = 'dish' | 'hours' | 'deal' | 'event' | 'hiring' | 'open' | 'holiday' | 'else' | 'slow' | 'post' | 'update'
/* SOURCE AND PIECES (owner 2026-09-17): where the picture comes from is one choice; what gets
   made from it is a set. A shoot day holds several plans, each with its own pieces. */
type Src = 'own' | 'shoot' | 'newshoot' | 'team' | 'words'
type Piece = 'graphic' | 'reel' | 'photos'
type Tier = 'standard' | 'full' | 'works'
type Also = 'gmenu' | 'sitemenu' | 'ordering' | 'apps' | 'email' | 'print' | 'team' | 'ghours' | 'fbevent' | 'sitepage' | 'creators' | 'gattr' | 'banner' | 'pos'
type Cta = 'order' | 'visit' | 'reserve' | 'message'
type Step = 'kind' | 'ekind' | 'night' | 'goal' | 'play' | 'facts' | 'content' | 'make' | 'plans' | 'picture' | 'where' | 'words' | 'plan' | 'done'
type GetIn = 'show' | 'rsvp' | 'tickets' | 'book'

interface Field { key: string; label: string; hint?: string; optional?: boolean; kind?: 'text' | 'date' | 'long' | 'time' }
interface KindDef {
  id: AnnounceKind; label: string; scene: Scene; hue: string; fields: Field[]
  photo?: boolean; picture?: boolean; tags?: boolean; limited?: boolean; also: Also[]; cta: Cta
  /** per-kind wording for an also-update line */
  alsoLabels?: Partial<Record<Also, { label?: string; detail?: string }>>
  /** the reminder switch, when this kind has a moment to remind about */
  reminder?: string
  /** hours controls: one day (a switch reveals them) or always (a holiday is one day) */
  hours?: 'oneday' | 'always'
  /** not on the Announce grid: reached from its own tile */
  hidden?: boolean
}

const KINDS: KindDef[] = [
  { id: 'dish', label: 'New dish', scene: 'dish', hue: '#2e9a78', photo: true, picture: true, tags: true, limited: true, cta: 'order', also: ['gmenu', 'sitemenu', 'ordering', 'apps', 'print', 'team'], fields: [
    { key: 'what', label: 'What is it called?', hint: 'Pork belly bánh mì' },
    { key: 'line', label: 'One line about it', hint: 'Slow-roasted, on a house baguette', optional: true },
    { key: 'price', label: 'Price', hint: '$14', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
  ] },
  { id: 'hours', label: 'Hours changed', scene: 'hours', hue: '#3d8ed8', photo: true, cta: 'visit', hours: 'oneday', also: ['ghours', 'print', 'team'],
    alsoLabels: { print: { label: 'Door sign', detail: 'The new hours, printed or a file' }, email: { detail: 'Only worth it for a big change' } }, fields: [
    { key: 'what', label: 'What is changing?', hint: 'Open till 10 on Fridays, or closed for a week' },
    { key: 'line', label: 'Anything else?', hint: 'Back to normal on the 30th', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
    { key: 'until', label: 'Until when', kind: 'date', optional: true, hint: 'Leave it empty if this is for good' },
  ] },
  { id: 'deal', label: 'A deal', scene: 'offer', hue: '#dd9a1c', photo: true, picture: true, cta: 'visit', also: ['print', 'gattr', 'banner', 'pos', 'team'], reminder: 'A reminder the morning it starts',
    alsoLabels: { print: { label: 'Flyer, table tent, window sign', detail: 'The people already inside tell friends' }, email: { detail: 'The day before, every time it runs' }, team: { detail: 'The deal, the word, what to say' } }, fields: [
    { key: 'what', label: 'What is the deal?', hint: 'Half-price wings and $5 drafts' },
    { key: 'when', label: 'When does it run?', hint: 'Tuesdays, 5 to 8' },
    { key: 'from', label: 'Starts', kind: 'date' },
    { key: 'until', label: 'Ends', kind: 'date', optional: true, hint: 'Google needs an end date. Thirty days if empty' },
    { key: 'off', label: 'How much off', hint: '50% on wings', optional: true },
    { key: 'price', label: 'It is usually', hint: '$14', optional: true },
    { key: 'code', label: 'A word at the counter', hint: 'TUESDAY. It is how we count', optional: true },
    { key: 'line', label: 'Any fine print?', hint: 'Dine in only', optional: true },
  ] },
  { id: 'event', label: 'An event', scene: 'event', hue: '#2e73b6', photo: true, picture: true, cta: 'visit', also: ['fbevent', 'sitepage', 'print', 'creators', 'team'], reminder: 'Two days before',
    alsoLabels: { print: { label: 'Poster and table tents', detail: 'Printed, or a file' }, email: { detail: 'A week before' }, team: { detail: 'A runsheet: who does what, when' } }, fields: [
    { key: 'what', label: 'What is it called?', hint: 'Trivia night' },
    { key: 'when', label: 'What day?', kind: 'date' },
    { key: 'time', label: 'What time?', hint: '7 to 9 pm' },
    { key: 'line', label: 'One line about it', hint: 'Teams of four, winner eats free', optional: true },
    { key: 'who', label: 'Who is on', hint: 'The band, the host, the chef', optional: true },
  ] },
  { id: 'hiring', label: 'Now hiring', scene: 'hiring', hue: '#7a5fd6', photo: true, picture: true, cta: 'message', also: ['team', 'print'],
    alsoLabels: { team: { label: 'Ask the team to share', detail: 'The card, and a nudge to post it' }, print: { label: 'Window sign', detail: 'Printed, or a file to print' } }, fields: [
    { key: 'what', label: 'What role?', hint: 'Line cook, weekends' },
    { key: 'line', label: 'Pay and hours', hint: 'Full time, starts at $22', optional: true },
    { key: 'how', label: 'How do they apply?', hint: 'Come in and ask for Ana, or a link', optional: true },
    { key: 'start', label: 'Start date', kind: 'date', optional: true },
  ] },
  { id: 'open', label: 'Now open', scene: 'open', hue: '#2e9a78', photo: true, picture: true, cta: 'visit', also: ['ghours', 'print', 'team'], reminder: 'A countdown post three days before',
    alsoLabels: { ghours: { label: 'Google says open', detail: 'Google, the website, the delivery apps' }, print: { label: 'Banner', detail: 'For the front, printed or a file' } }, fields: [
    { key: 'what', label: 'What is the news?', hint: 'Grand opening, back open, a new location, now on DoorDash' },
    { key: 'from', label: 'From when', kind: 'date' },
    { key: 'line', label: 'One line about it', hint: 'Same menu, twice the seats', optional: true },
    { key: 'offer', label: 'An opening offer', hint: 'First 50 guests get a free drink', optional: true },
    { key: 'address', label: 'The address, if it is new', hint: '412 Main St', optional: true },
  ] },
  { id: 'holiday', label: 'Holiday', scene: 'holiday', hue: '#dd9a1c', photo: true, picture: true, cta: 'reserve', hours: 'always', also: ['ghours', 'print', 'team'], reminder: 'A reminder before the day, or the pre-order deadline',
    alsoLabels: { ghours: { label: 'Holiday hours everywhere', detail: 'Google, the website, the delivery apps' }, print: { label: 'Menu insert', detail: 'The holiday menu or the hours, printed or a file' } }, fields: [
    { key: 'what', label: 'Which holiday?', hint: 'Thanksgiving' },
    { key: 'date', label: 'Which day?', kind: 'date' },
    { key: 'doing', label: 'What are you doing?', kind: 'long', hint: 'Pre-orders for pies, a special menu, open till 2 on the day' },
    { key: 'deadline', label: 'Pre-orders by', kind: 'date', optional: true },
  ] },
  { id: 'else', label: 'Something else', scene: 'else', hue: '#6e6e73', photo: true, picture: true, cta: 'visit', also: ['team'], fields: [
    { key: 'what', label: 'What is the news?', kind: 'long', hint: 'We hit 100 reviews. Thank you.' },
    { key: 'from', label: 'A date, if there is one', kind: 'date', optional: true },
  ] },
  /* the slow night: a front door, not a flow (owner 2026-09-17: "what would it do"). Two screens,
     which night and which play, then it hands into the Deal or the Event flow with every week on. */
  { id: 'slow', label: 'Slow night', scene: 'offer', hue: '#3b6fd4', hidden: true, cta: 'visit', also: [], fields: [] },
  /* A post (the Post tile, folded in 2026-09-17): a photo up top, what it is about, the words at
     the best hour. The full composer stays at /dashboard/post for the controls this hides. */
  { id: 'post', label: 'A post', scene: 'post', hue: '#0f97a8', hidden: true, photo: true, picture: true, cta: 'visit', also: [], fields: [
    { key: 'what', label: 'What is it about?', kind: 'long', hint: 'The new patio chairs. Friday prep. Ana on the line. Whatever you would tell a regular.' },
    { key: 'who', label: 'Anyone to tag', hint: '@thefarm, @ana', optional: true },
  ] },
  /* Update (the Update tile, folded): what changed on the listing, from when. One-day hours go
     to Google straight away; everything else is one team line across Google, the website and
     the apps. A post is optional. */
  { id: 'update', label: 'Update', scene: 'hours', hue: '#6a39de', hidden: true, photo: true, cta: 'visit', hours: 'oneday', also: ['ghours', 'team'],
    alsoLabels: { ghours: { label: 'Everywhere', detail: 'Google, the website, the delivery apps' }, team: { detail: 'So the phone gets it right' } }, fields: [
    { key: 'what', label: 'What changed?', kind: 'long', hint: 'New phone number. Menu link. Closed Mondays now. A new photo of the front.' },
    { key: 'from', label: 'From when', kind: 'date' },
  ] },
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PARTS: { id: string; label: string; hour: number; runs: string }[] = [{ id: 'lunch', label: 'Lunch', hour: 10, runs: '11 to 2' }, { id: 'afternoon', label: 'Afternoon', hour: 13, runs: '2 to 5' }, { id: 'dinner', label: 'Dinner', hour: 16, runs: '5 to 8' }, { id: 'late', label: 'Late', hour: 19, runs: '8 to close' }]

const TAGS = ['Spicy', 'Vegan', 'Vegetarian', 'Gluten free', 'Nuts', 'Dairy free', 'Halal']
const EVENT_TAGS = ['21+', 'Kids welcome', 'Outdoors', 'Free parking', 'Free entry']
/** the kind of night: it sets every default below it */
interface EventKind { id: string; label: string; small: string; scene: Scene; hue: string; weekly: boolean; getin: GetIn }
const EVENT_KINDS: EventKind[] = [
  { id: 'trivia', label: 'Trivia or games', small: 'Weekly, teams, a prize', scene: 'event', hue: '#2e73b6', weekly: true, getin: 'show' },
  { id: 'music', label: 'Live music', small: 'A band, a DJ, an open mic', scene: 'reel', hue: '#6a39de', weekly: false, getin: 'show' },
  { id: 'dinner', label: 'A special dinner', small: 'Tasting, pop-up, a chef', scene: 'dish', hue: '#2e9a78', weekly: false, getin: 'tickets' },
  { id: 'happyhour', label: 'Happy hour launch', small: 'A new deal, every week', scene: 'offer', hue: '#d99a1e', weekly: true, getin: 'show' },
  { id: 'watch', label: 'A watch party', small: 'The game on the big screen', scene: 'creator', hue: '#c92d32', weekly: false, getin: 'book' },
  { id: 'party', label: 'A party', small: 'Anniversary, holiday, launch', scene: 'holiday', hue: '#d99a1e', weekly: false, getin: 'rsvp' },
  { id: 'offsite', label: 'Off-site', small: 'A market, a festival, a pop-up', scene: 'pin', hue: '#3b6fd4', weekly: false, getin: 'show' },
  { id: 'other', label: 'Something else', small: 'Class, fundraiser, kids day', scene: 'else', hue: '#6e6e73', weekly: false, getin: 'rsvp' },
]
const GETIN: { id: GetIn; label: string; cta: string }[] = [{ id: 'show', label: 'Just show up', cta: 'Just show up' }, { id: 'rsvp', label: 'RSVP', cta: 'RSVP at the link' }, { id: 'tickets', label: 'Tickets', cta: 'Get tickets' }, { id: 'book', label: 'Book a table', cta: 'Book a table' }]
const ALSO: Record<Also, { label: string; scene: Scene; hue: string; detail: (ctx: Ctx | null) => string; on: (ctx: Ctx | null) => boolean }> = {
  gmenu: { label: 'Google menu', scene: 'google', hue: '#3b6fd4', detail: () => 'Name, photo and price', on: () => true },
  sitemenu: { label: 'Website menu', scene: 'sitemenu', hue: '#0f97a8', detail: (c) => c?.website ? c.website.replace(/^https?:\/\//, '') : 'If we run your site', on: (c) => !!c?.website },
  ordering: { label: 'Online ordering', scene: 'order', hue: '#34a76a', detail: (c) => c?.orderUrl ? 'So Order online works on day one' : 'No ordering link on file yet', on: (c) => !!c?.orderUrl },
  apps: { label: 'DoorDash and Uber Eats', scene: 'apps', hue: '#c92d32', detail: () => 'We add it to both', on: () => false },
  email: { label: 'Tell your regulars', scene: 'email', hue: '#2e9a78', detail: (c) => c && c.guests > 0 ? `${c.guests.toLocaleString()} people on your list` : 'No list yet. We start one', on: (c) => !!c && c.guests > 0 },
  print: { label: 'Table tent', scene: 'print', hue: '#d99a1e', detail: () => 'Printed, or a file to print', on: () => false },
  team: { label: 'Tell the team', scene: 'dm', hue: '#5b53d6', detail: () => 'One card: what it is, how to say it', on: () => true },
  ghours: { label: 'Hours everywhere', scene: 'hours', hue: '#3b6fd4', detail: () => 'Google, the website, the delivery apps', on: () => true },
  fbevent: { label: 'Facebook Event', scene: 'event', hue: '#2e73b6', detail: () => 'People say Going, their friends see it', on: () => true },
  sitepage: { label: 'Website events page', scene: 'site', hue: '#0f97a8', detail: (c) => c?.website ? c.website.replace(/^https?:\/\//, '') : 'If we run your site', on: (c) => !!c?.website },
  creators: { label: 'Invite a creator', scene: 'creator', hue: '#6a39de', detail: () => 'Two local food creators, comped', on: () => false },
  gattr: { label: 'Google listing: happy hour', scene: 'google', hue: '#3b6fd4', detail: () => 'The attribute, so it shows in search. Only if it is one', on: () => false },
  banner: { label: 'Website banner', scene: 'site', hue: '#0f97a8', detail: (c) => c?.website ? 'On the home page, on the day' : 'If we run your site', on: (c) => !!c?.website },
  pos: { label: 'The register button', scene: 'order', hue: '#34a76a', detail: () => 'One tap for the team, and it counts', on: () => false },
}
const CTAS: { id: Cta; label: string }[] = [{ id: 'order', label: 'Order online' }, { id: 'visit', label: 'Come in' }, { id: 'reserve', label: 'Reserve' }, { id: 'message', label: 'Message us' }]
const PLAT: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }

interface Target { accountId: string; platform: string; name: string }
interface Best { iso: string; label: string; posts: number }
interface Shoot { id: string; requestId: string | null; date: string | null; tier: Tier; tierLabel: string; photos: number; spots: number; used: number; left: number; attached: { label: string; kind: string; pieces: string[] }[]; needs: Tier | null; needsLabel: string | null; upgradeCents: number | null; href: string | null }
interface Ctx { name: string; pro: boolean; website: string | null; orderUrl: string | null; reserveUrl: string | null; guests: number; usualReach?: { median: number; min: number; max: number; n: number } | null; nextShoot: { id: string; date: string; who: string | null } | null; shoot: Shoot | null; planShoot?: string | null; prices: { graphic: number | null; video: number | null; shoot: number | null; tiers?: Record<Tier, number | null>; spots?: Record<Tier, number> }; weekdays?: { d: number; avgCents: number }[] | null; avgTicketCents?: number | null }
/* a shoot day is a visit with a shot list; the size follows the list */
const TIERS: { id: Tier; label: string; photos: number; upto: number }[] = [{ id: 'standard', label: 'A quick visit', photos: 15, upto: 2 }, { id: 'full', label: 'Half a day', photos: 25, upto: 4 }, { id: 'works', label: 'A full day', photos: 40, upto: 6 }]
const tierFor = (n: number): Tier => (n <= 2 ? 'standard' : n <= 4 ? 'full' : 'works')
interface PlanLine { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }
type Goal = 10 | 25 | 50 | 999
const GOALS: { id: Goal; label: string }[] = [{ id: 10, label: '+10 people' }, { id: 25, label: '+25' }, { id: 50, label: '+50' }, { id: 999, label: 'Full house' }]
/** a dollar of Boost reaches about this many people nearby (Meta local, a plain average) */
const REACH_PER_DOLLAR = 150
const slowestDay = (c: Ctx | null): number | null => { const w = c?.weekdays; if (!w || !w.length) return null; const withData = w.filter((x) => x.avgCents > 0); if (withData.length < 4) return null; return withData.reduce((a, b) => (b.avgCents < a.avgCents ? b : a)).d }

function hexa(h: string, a: number) { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})` }
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayIso = () => isoDay(new Date())
const plusDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d) }
const maxIso = (a: string, b: string) => (a > b ? a : b)
const niceDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const longDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
const dollars = (c: number | null) => (c == null ? '' : `$${Math.round(c / 100).toLocaleString()}`)
const localInput = (d: Date) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export default function AnnounceSheet({ clientId, onClose, hasGoogle = true, initialKind, page = false, onPick }: { clientId: string; onClose: () => void; /** A PAGE, NOT A POPUP (owner 2026-09-18): render inline under the app shell instead of a bottom sheet */ page?: boolean; /** in page mode the kind grid hands the pick to the router */ onPick?: (kind: AnnounceKind) => void; /** whether the client has a Google listing to post to */ hasGoogle?: boolean; /** open straight on one kind: the Slow night tile */ initialKind?: AnnounceKind }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  /* The page behind must not move while the sheet is up (owner 2026-09-17: "you can move the form
     around"): the body is pinned at its scroll position and put back on close. */
  useEffect(() => {
    if (page) return
    const y = window.scrollY
    const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }
    b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden'
    return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y) }
  }, [])
  /* The sheet sits in the VISIBLE part of the screen: when the keyboard comes up the visual
     viewport shrinks and the sheet shrinks with it instead of being shoved off the top. */
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    const v = window.visualViewport
    const read = () => setVv(v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null)
    read()
    v?.addEventListener('resize', read); v?.addEventListener('scroll', read)
    return () => { v?.removeEventListener('resize', read); v?.removeEventListener('scroll', read) }
  }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const [step, setStepRaw] = useState<Step>('kind')
  /* MOTION (owner 2026-09-18): screens slide, forward to the left, back to the right */
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const ORDER: Step[] = ['kind', 'ekind', 'night', 'goal', 'play', 'facts', 'plans', 'picture', 'where', 'words', 'plan', 'done']
  const setStep = (next: Step) => { setDir(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 'fwd' : 'back'); setStepRaw(next) }
  const [kind, setKind] = useState<KindDef | null>(null)
  const [a, setA] = useState<Record<string, string>>({})
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [limited, setLimited] = useState(false)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [bests, setBests] = useState<Best[]>([])
  const [media, setMedia] = useState<{ url: string; preview: string; video: boolean }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [src, setSrc] = useState<Src>('words')
  const [pieces, setPieces] = useState<Set<Piece>>(new Set())
  const [alsoShoot, setAlsoShoot] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [shootDate, setShootDate] = useState('')
  const [priceOn, setPriceOn] = useState(true)
  const [brandKit, setBrandKit] = useState(true)
  const [readyBy, setReadyBy] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [google, setGoogle] = useState(hasGoogle)
  const [story, setStory] = useState(true)
  const [also, setAlso] = useState<Set<Also>>(new Set())
  const [timing, setTiming] = useState<'ready' | 'by' | 'at'>('by')
  const [postBy, setPostBy] = useState(plusDays(todayIso(), 5))
  const [atLocal, setAtLocal] = useState(localInput(new Date(Date.now() + 3600e3)))
  const [again, setAgain] = useState(false)
  const [boost, setBoost] = useState(false)
  const [reminder, setReminder] = useState(true)
  const [reminderText, setReminderText] = useState('')
  const [ekind, setEkind] = useState<EventKind | null>(null)
  const [weekly, setWeekly] = useState(false)
  const [getin, setGetin] = useState<GetIn>('show')
  const [link, setLink] = useState('')
  const [price, setPrice] = useState('')
  const [where, setWhere] = useState<'here' | 'patio' | 'else'>('here')
  const [address, setAddress] = useState('')
  const [tonight, setTonight] = useState(true)
  const [after, setAfter] = useState(true)
  const [tonightText, setTonightText] = useState('')
  const [afterText, setAfterText] = useState('')
  const [goal, setGoal] = useState<Goal>(25)
  const [night, setNight] = useState<number>(2)
  const [part, setPart] = useState('dinner')
  const [slowWords, setSlowWords] = useState('')
  const [tables, setTables] = useState<number>(10)
  const [fromSlow, setFromSlow] = useState(false)
  const [boostCents, setBoostCents] = useState(2000)
  const [socialEs, setSocialEs] = useState('')
  const [postByTouched, setPostByTouched] = useState(false)
  const [oneDay, setOneDay] = useState(false)
  const [closed, setClosed] = useState(false)
  const [openAt, setOpenAt] = useState('10:00')
  const [closeAt, setCloseAt] = useState('14:00')
  const [writing, setWriting] = useState(false)
  /* THREE PLANS (owner 2026-09-18, "as simple as possible"): after the facts, three priced cards.
     Picking one sets every default below; What is inside opens the old screens to change them. */
  /* THE MENU (owner 2026-09-18): items with options, picked by the server rules, edited freely.
     The items drive the same state the old screens read (src, pieces, boost, also), so every
     rail underneath stays the same. */
  type Pic = 'own' | 'graphic' | 'shoot' | 'booked' | 'words'
  const [items, setItems] = useState<ItemPick[]>([])
  const [me, setMe] = useState<MenuMe | null>(null)
  const [openItem, setOpenItemRaw] = useState<string | null>(null)
  const setOpenItem = (uid: string | null) => { setDir(uid ? 'fwd' : 'back'); setOpenItemRaw(uid) }
  const [suggested, setSuggested] = useState<string | null>(null)
  const [withReel, setWithReel] = useState(false)
  const [budget, setBudget] = useState('')
  const [pic, setPic] = useState<Pic>('graphic')
  const [social, setSocial] = useState('')
  const [gtext, setGtext] = useState('')
  const [card, setCard] = useState('')
  const [cta, setCta] = useState<Cta>('visit')
  const [spanish, setSpanish] = useState(false)
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ plan: PlanLine[]; errors: string[]; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /* the accounts a post can go to and the best hours, the same list the composer reads; and the
     business's own facts: the ordering link, the list, a shoot already booked, the prices */
  useEffect(() => {
    let live = true
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    fetch(`/api/dashboard/social-publish?clientId=${clientId}&tz=${encodeURIComponent(tz)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { targets?: Target[]; bests?: Best[] } | null) => {
        if (!live) return
        const t = (j?.targets ?? []).filter((x) => x && x.accountId && x.platform)
        setTargets(t); setBests(Array.isArray(j?.bests) ? j!.bests! : [])
        setChosen(new Set(t.filter((x) => x.platform === 'instagram' || x.platform === 'facebook').map((x) => x.accountId)))
      })
      .catch(() => { if (live) setTargets([]) })
    fetch(`/api/dashboard/announce?clientId=${clientId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Ctx | null) => { if (live && j) setCtx(j) })
      .catch(() => {})
    return () => { live = false }
  }, [clientId])

  const pick = (k: KindDef) => {
    if (onPick && !initialKind) { onPick(k.id); return }
    setKind(k); setCta(k.cta); setTags(new Set()); setLimited(false); setOneDay(false); setClosed(k.id === 'holiday'); setReminder(!!k.reminder); setReminderText('')
    const dateKey = k.fields.find((f) => f.kind === 'date')?.key
    setA(dateKey ? { [dateKey]: todayIso() } : {})
    setAlso(new Set(k.also.filter((x) => ALSO[x].on(ctx))))
    setEkind(null); setWeekly(false); setGetin('show'); setLink(''); setPrice(''); setWhere('here'); setAddress(''); setTonight(true); setAfter(true); setTonightText(''); setAfterText(''); setGoal(25); setPostByTouched(false); setSocialEs(''); setFromSlow(false); setTables(10)
    if (k.id === 'slow') { setNight(slowestDay(ctx) ?? 2); setPart('dinner') }
    if (k.id === 'post') setGoogle(false)
    if (k.id === 'update') setGoogle(hasGoogle)
    setStep(k.id === 'event' ? 'ekind' : k.id === 'slow' ? 'night' : k.picture && k.hidden ? 'picture' : 'facts')
  }
  const isSlow = kind?.id === 'slow'
  const isDeal = kind?.id === 'deal'
  /* THE HANDOFF: the slow night becomes a weekly deal or a weekly event, with the night, the run
     and the goal already filled in, in a flow the owner already knows. */
  const handoff = (to: 'deal' | 'event') => {
    const k = KINDS.find((x) => x.id === to)!
    const p = PARTS.find((x) => x.id === part)!
    setKind(k); setCta(k.cta); setTags(new Set()); setLimited(false); setFromSlow(true)
    setAlso(new Set(k.also.filter((x) => ALSO[x].on(ctx))))
    setWeekly(true); setBoost(true); setBoostCents(1500); setTables(10); setPostByTouched(false)
    if (to === 'deal') {
      const from = nextDay(night)
      setA({ what: '', when: `${DAYS[night]}s, ${p.runs}`, from, until: plusDays(from, 21), code: DAYS[night].toUpperCase(), line: '' })
      setStep('facts')
    } else {
      setA({ what: '', when: nextDay(night), time: p.runs.replace(' to ', ' to ') + (part === 'late' ? '' : ' pm') })
      setGetin('show'); setEkind(null)
      setStep('ekind')
    }
  }
  useEffect(() => { if (initialKind) { const k = KINDS.find((x) => x.id === initialKind); if (k) pick(k) } }, [initialKind]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isSlow && ctx?.weekdays && step === 'night') { const d = slowestDay(ctx); if (d != null) setNight(d) } }, [ctx]) // eslint-disable-line react-hooks/exhaustive-deps
  /* the next date that weekday falls on, from tomorrow */
  const nextDay = (w: number, from = 1) => { const d = new Date(); d.setDate(d.getDate() + from); while (d.getDay() !== w) d.setDate(d.getDate() + 1); return isoDay(d) }
  const tableCents = ctx?.avgTicketCents && ctx.avgTicketCents > 500 ? ctx.avgTicketCents * 2 : 6000
  const discount = (): number | null => { const off = a.off ?? ''; const price = a.price ?? ''; const m = off.match(/(\d{1,2})\s*%/); if (m) return Number(m[1]) / 100; const pr = price.match(/\$?\s*(\d+(?:\.\d+)?)/); const dol = off.match(/\$\s*(\d+(?:\.\d+)?)\s*off/i); if (pr && dol) return Math.min(0.9, Number(dol[1]) / Number(pr[1])); if (/2\s*for\s*1|half/i.test(off + ' ' + (a.what ?? ''))) return 0.5; return null }
  const breakEven = (): string => { const dsc = discount(); if (dsc == null) return ''; const need = Math.round((dsc / (1 - dsc)) * 100); return `At ${Math.round(dsc * 100)}% off you need ${need}% more orders of it to break even on it alone.${weekly ? ` Your target is ${tables === 999 ? 'a full room' : `${tables} more tables`} a night, and drinks and the rest of the order carry it.` : ' The rest of the order carries it.'}` }
  /* the night a weekly deal runs on: from the start date */
  const dealDay = (): number => { const f = a.from; if (!f) return night; const d = new Date(f + 'T12:00:00'); return Number.isNaN(d.getTime()) ? night : d.getDay() }
  const pickEvent = (e: EventKind) => {
    setEkind(e); setWeekly(e.weekly || fromSlow); setGetin(e.getin)
    setA((x) => ({ ...x, what: x.what?.trim() ? x.what : e.label }))
    setStep('facts')
  }
  const isEvent = kind?.id === 'event'
  const required = kind ? kind.fields.filter((f) => !f.optional) : []
  const ready = required.every((f) => (a[f.key] ?? '').trim())
  /* MORE THAN ONE DISH (owner 2026-09-22): the first lives in the fields; the rest here, each a name, a line, a price */
  const [dishes, setDishes] = useState<{ name: string; line: string; price: string }[]>([])
  const [detail, setDetail] = useState<null | 'content' | 'from' | 'look' | 'tags' | 'note' | 'dish'>(null)
  const [newDish, setNewDish] = useState({ name: '', line: '', price: '' })
  /* THE CONTENT SCREEN (owner 2026-09-22): where the photo comes from, asked before the plan. */
  type Content = 'newshoot' | 'shoot' | 'own' | 'library' | 'stock' | 'none'
  const [content, setContent] = useState<Content | null>(null)
  const [library, setLibrary] = useState<{ id: string; name: string; url: string }[] | null>(null)
  const [libSel, setLibSel] = useState<Set<string>>(new Set())
  const [wantVideo, setWantVideo] = useState(false)
  const [wantGraphic, setWantGraphic] = useState(true)
  const isoPlus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const dishRow = (label: string, v: string, set: (v: string) => void, ph: string, first?: boolean, money?: boolean, required?: boolean) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: first ? 0 : `0.5px solid ${C.line}`, cursor: 'text' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, flex: 'none' }}>{label}{required && <small style={{ fontSize: 11, fontWeight: 600, color: C.faint, marginLeft: 6, letterSpacing: '.02em' }}>Required</small>}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
        {money && <span style={{ fontSize: 15, fontWeight: 500, color: v ? C.ink : C.faint }}>$</span>}
        <input type="text" inputMode={money ? 'decimal' : undefined} value={v} onChange={(e) => set(money ? e.target.value.replace(/^\$/, '') : e.target.value)} placeholder={ph} style={{ flex: money ? 'none' : 1, width: money ? `${(v || ph).length}ch` : undefined, minWidth: 0, border: 0, outline: 'none', background: 'none', font: 'inherit', padding: 0, color: C.ink, fontSize: 15, fontWeight: 500, lineHeight: 1.3, textAlign: 'right' }} />
      </span>
    </label>
  )
  const platforms = useMemo(() => Array.from(new Set((targets ?? []).filter((t) => chosen.has(t.accountId)).map((t) => t.platform))), [targets, chosen])
  const igChosen = platforms.includes('instagram')
  const hasIgFb = (targets ?? []).some((t) => (t.platform === 'instagram' || t.platform === 'facebook') && chosen.has(t.accountId))
  const onShoot = src === 'shoot' || src === 'newshoot'
  const madeLater = pieces.size > 0 || onShoot
  /* the open shoot: the one on file, or a photos order booked at the desk that becomes one */
  const openShoot = ctx?.shoot ?? (ctx?.nextShoot ? { id: '', requestId: ctx.nextShoot.id, date: ctx.nextShoot.date, tier: 'standard' as Tier, tierLabel: 'A quick visit', photos: 15, spots: 2, used: 0, left: 2, attached: [], needs: null, needsLabel: null, upgradeCents: null, href: null } : null)
  const tierCents = (t: Tier) => ctx?.prices.tiers?.[t] ?? ctx?.prices.shoot ?? null
  /* the shot list of a new day: this plan plus whatever else they typed */
  const alsoItems = alsoShoot.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5)
  const listN = 1 + alsoItems.length
  const tier: Tier = tierFor(listN)
  const sizeOf = (n: number) => { const t = TIERS.find((x) => x.id === tierFor(n))!; return `${n} thing${n === 1 ? '' : 's'} · about ${t.photos} photos · ${dollars(tierCents(t.id)) || ''}` }
  /* the day the pieces come back: three days after the shoot, or the desk's own lead time */
  const shootLead = src === 'newshoot' ? (shootDate || plusDays(todayIso(), 7)) : openShoot?.date ?? plusDays(todayIso(), 7)
  const channels = useMemo(() => [...(google ? ['google'] : []), ...platforms], [google, platforms])
  /* Order online only when there is a link to order from; otherwise the ask is to come in */
  const ctaEff: Cta = isEvent ? (getin === 'show' ? 'visit' : 'reserve') : cta === 'order' && !ctx?.orderUrl ? 'visit' : cta

  /* the best hour, as a local time of day, from the accounts' own history; 6 pm when there is none */
  const bestHour = useMemo(() => { const b = bests[0]; if (!b) return { h: 18, m: 0 }; const d = new Date(b.iso); return Number.isNaN(d.getTime()) ? { h: 18, m: 0 } : { h: d.getHours(), m: d.getMinutes() } }, [bests])
  /* the moment the post goes out, for every timing mode */
  const postAt = useMemo((): Date | null => {
    const at = (iso: string) => { const d = new Date(iso + 'T00:00:00'); d.setHours(bestHour.h, bestHour.m, 0, 0); if (d.getTime() < Date.now()) return new Date(Date.now() + 5 * 60e3); return d }
    if (timing === 'at') { const d = new Date(atLocal); return Number.isNaN(d.getTime()) ? null : d }
    if (timing === 'by') return at(postBy)
    if (madeLater && readyBy) return at(plusDays(readyBy, 1))
    return null
  }, [timing, atLocal, postBy, madeLater, readyBy, bestHour])
  const postDay = postAt ? isoDay(postAt) : todayIso()
  const postNow = !postAt || postAt.getTime() <= Date.now() + 60e3

  /* the day the picture must be ready: two days before the post for a graphic, longer for a
     video or a shoot, never before the desk can make it */
  const minReady = () => onShoot ? plusDays(shootLead, 3) : plusDays(todayIso(), pieces.has('reel') ? 4 : 2)
  const settle = (nextSrc: Src, nextPieces: Set<Piece>) => {
    const on = nextSrc === 'shoot' || nextSrc === 'newshoot'
    if (nextPieces.size || on) { const lead = on ? plusDays(nextSrc === 'newshoot' ? (shootDate || plusDays(todayIso(), 7)) : openShoot?.date ?? plusDays(todayIso(), 7), 3) : plusDays(todayIso(), nextPieces.has('reel') ? 4 : 2); setReadyBy(maxIso(lead, timing === 'by' ? plusDays(postBy, -2) : lead)) }
    else setReadyBy('')
  }
  const choose = (m: Src) => {
    setSrc(m)
    /* each source starts with the pieces it usually means; the owner adds or drops from there */
    const p = new Set<Piece>(m === 'team' ? ['graphic'] : m === 'shoot' || m === 'newshoot' ? ['photos'] : [])
    setPieces(p); settle(m, p)
  }
  const togglePiece = (pc: Piece) => { const p = new Set(pieces); if (p.has(pc)) p.delete(pc); else p.add(pc); if (src === 'team' && !p.size) p.add('graphic'); setPieces(p); settle(src, p) }
  useEffect(() => { if (timing === 'by' && madeLater && readyBy > plusDays(postBy, -1)) setReadyBy(maxIso(minReady(), plusDays(postBy, -2))) }, [postBy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (src === 'newshoot') settle(src, pieces) }, [shootDate]) // eslint-disable-line react-hooks/exhaustive-deps
  /* LEAD TIME BY KIND: the announce date is set from what the kind needs, not a flat five days.
     Tickets and RSVPs need two weeks. A walk-in night needs four days. A deal, three before it
     starts. An opening, a week. A holiday, two weeks. A dish, hours or a hire: today. */
  const leadDefault = (): { day: string; why: string } => {
    const dd = rawDates(); const today = todayIso()
    const back = (iso: string | undefined, n: number, why: string) => (iso ? { day: maxIso(today, plusDays(iso, -n)), why } : { day: today, why: 'Today. Nothing to wait for' })
    if (isEvent) return getin === 'tickets' || getin === 'rsvp' ? back(dd.when, 14, 'Two weeks before. Tickets and RSVPs need time to plan') : back(dd.when, 4, 'Four days before. Long enough to plan a night, short enough to remember')
    if (kind?.id === 'deal') return back(dd.from, 3, 'Three days before it starts, so the first day is busy')
    if (kind?.id === 'open') return back(dd.from, 7, 'A week before, so the countdown has room')
    if (kind?.id === 'holiday') return dd.deadline ? back(dd.deadline, 10, 'Ten days before the pre-order deadline') : back(dd.date, 14, 'Two weeks before the day')
    if (kind?.id === 'dish') return dd.from && dd.from > today ? { day: dd.from, why: 'The day it lands on the menu' } : { day: today, why: 'It is on the menu now, so today' }
    return { day: today, why: 'Today. Nothing to wait for' }
  }
  useEffect(() => {
    if (step !== 'where' || postByTouched) return
    const l = leadDefault()
    setPostBy(l.day)
    setTiming(l.day === todayIso() && !madeLater ? 'ready' : 'by')
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  /* THE GOAL sets the loud switches: a bigger night turns Boost on, invites the creators, and
     says why on the plan. Set once when the goal is picked; every switch stays the owner's after. */
  const applyGoal = (g: Goal) => {
    setGoal(g)
    if (!isEvent) return
    setBoost(g >= 25 || getin === 'tickets'); setBoostCents(g >= 50 ? 4000 : 2000)
    setAlso((prev) => { const n = new Set(prev); if (g >= 50) n.add('creators'); else n.delete('creators'); return n })
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true); setErr(null)
    try {
      for (const file of Array.from(files).slice(0, 10 - media.length)) {
        const r = await fetch('/api/dashboard/social-publish/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, filename: file.name, contentType: file.type, size: file.size }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.uploadUrl) throw new Error(j.error || 'Could not add the photo')
        const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('Could not add the photo')
        setMedia((m) => [...m, { url: j.fileUrl, preview: URL.createObjectURL(file), video: file.type.startsWith('video/') }])
        if (src === 'words' || src === 'own') setSrc('own')
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the photo') }
    setUploading(false)
  }

  const factsOut = (): Record<string, string> => {
    const facts: Record<string, string> = { ...a }
    const extra = dishes.filter((d) => d.name.trim())
    const money = (v?: string) => (v && /^\d/.test(v.trim()) ? `$${v.trim()}` : (v ?? ''))
    if (kind?.id === 'dish') facts.price = money(a.price)
    if (kind?.id === 'dish' && extra.length) { facts.dishes = JSON.stringify([{ name: a.what ?? '', line: a.line ?? '', price: money(a.price) }, ...extra.map((d) => ({ ...d, price: money(d.price) }))]); facts.what = [a.what, ...extra.map((d) => d.name)].filter(Boolean).join(', '); facts.note = [a.note, `Also new: ${extra.map((d) => `${d.name}${d.price ? ` (${money(d.price)})` : ''}${d.line ? ` — ${d.line}` : ''}`).join('; ')}`].filter(Boolean).join('\n') }
    for (const f of kind?.fields ?? []) if (f.kind === 'date' && facts[f.key]) facts[f.key] = longDate(facts[f.key])
    if (tags.size) facts.tags = Array.from(tags).join(', ')
    if (kind?.limited) { if (limited && a.until) facts.until = longDate(a.until); else delete facts.until }
    if (hoursOn) facts.hours = closed ? `Closed that day` : `Open ${clock(openAt)} to ${clock(closeAt)} that day`
    if (isDeal && weekly) {
      facts.weekly = `Every ${DAYS[dealDay()]}, ${a.when ?? ''}`.trim()
      facts.goal = `${tables === 999 ? 'A full room' : `${tables} more tables`} a night`
      if (fromSlow) facts.night = `${DAYS[night]} ${(PARTS.find((x) => x.id === part)?.label ?? 'dinner').toLowerCase()} is the slow one${slowWords.trim() ? `: ${slowWords.trim()}` : ''}`
    }
    if (isEvent) {
      if (ekind) facts.kindOfNight = ekind.label
      const g = GETIN.find((x) => x.id === getin)!
      facts.getin = getin === 'show' ? 'Just show up, no ticket' : getin === 'tickets' ? `Tickets${price ? ` ${price}` : ''}${link ? ` at ${link}` : ' at the door'}` : getin === 'rsvp' ? `RSVP${link ? ` at ${link}` : ''}` : `Book a table${ctx?.reserveUrl ? ` at ${ctx.reserveUrl}` : ''}`
      if (link) facts.rsvp = link
      if (price) facts.tickets = price
      if (where === 'patio') facts.where = 'On the patio'; else if (where === 'else' && address) facts.where = address
      if (weekly) facts.weekly = 'Every week, same day and time'
      facts.cta = g.cta
    }
    return facts
  }
  const hoursOn = kind?.hours === 'always' || (kind?.hours === 'oneday' && oneDay)
  const clock = (t: string) => { const [h, m] = t.split(':').map(Number); if (Number.isNaN(h)) return t; const d = new Date(); d.setHours(h, m || 0, 0, 0); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: m ? '2-digit' : undefined }) }
  const rawDates = (): Record<string, string> => { const out: Record<string, string> = {}; for (const f of kind?.fields ?? []) if (f.kind === 'date' && a[f.key]) out[f.key] = a[f.key]; if (kind?.limited && limited && a.until) out.until = a.until; return out }
  /* the extra posts this kind asks for: a reminder, a countdown, a Story the morning of, a second repeat */
  const atHour = (iso: string, h: number, m = 0) => { const d = new Date(iso + 'T00:00:00'); d.setHours(h, m, 0, 0); return d }
  const reminderWhen = (): { phrase: string; at: Date; label: string; detail: string } | null => {
    if (!kind?.reminder || !reminder) return null
    const dd = rawDates()
    if (kind.id === 'event' && dd.when) { const d = atHour(plusDays(dd.when, -2), bestHour.h, bestHour.m); return { phrase: 'two days before the event', at: d, label: 'Reminder post', detail: 'Two days before' } }
    if (kind.id === 'deal' && dd.from) { return { phrase: 'the morning the deal starts', at: atHour(dd.from, 10), label: 'Reminder post', detail: 'The morning it starts' } }
    if (kind.id === 'open' && dd.from) { return { phrase: 'three days before opening', at: atHour(plusDays(dd.from, -3), bestHour.h, bestHour.m), label: 'Countdown post', detail: 'Three days to go' } }
    if (kind.id === 'holiday' && (dd.deadline || dd.date)) { return dd.deadline ? { phrase: 'three days before the pre-order deadline', at: atHour(plusDays(dd.deadline, -3), bestHour.h, bestHour.m), label: 'Reminder post', detail: 'Three days before the pre-order deadline' } : { phrase: 'the day before', at: atHour(plusDays(dd.date, -1), bestHour.h, bestHour.m), label: 'Reminder post', detail: 'The day before' } }
    return null
  }
  const extras = (): { key: string; label: string; detail: string; at: string; text: string; story?: boolean }[] => {
    const out: { key: string; label: string; detail: string; at: string; text: string; story?: boolean }[] = []
    const r = reminderWhen()
    if (r && r.at.getTime() > Date.now() + 60e3 && reminderText.trim()) out.push({ key: 'reminder', label: r.label, detail: r.detail, at: r.at.toISOString(), text: reminderText.trim() })
    const dd = rawDates()
    if (kind?.id === 'event' && dd.when) {
      const day0 = dd.when
      if (tonight && story && hasIgFb && media.length) { const d = atHour(day0, 10); if (d.getTime() > Date.now()) out.push({ key: 'story-dayof', label: 'Story the morning of', detail: 'Where people scroll that day', at: d.toISOString(), text: tonightText.trim() || social.trim(), story: true }) }
      if (tonight && tonightText.trim()) { const d = atHour(day0, 16); if (d.getTime() > Date.now()) out.push({ key: 'tonight', label: 'Tonight', detail: 'A post at 4 pm', at: d.toISOString(), text: tonightText.trim() }) }
      if (after && afterText.trim()) { const d = atHour(plusDays(day0, 1), 11); if (d.getTime() > Date.now()) out.push({ key: 'after', label: 'The day after', detail: 'Thanks, and the next one', at: d.toISOString(), text: afterText.trim() }) }
      if (weekly) for (let w = 1; w <= 4; w++) {
        const dayW = plusDays(day0, 7 * w)
        if (reminder && reminderText.trim()) out.push({ key: `w${w}-reminder`, label: 'Reminder', detail: `Week ${w}, two days before`, at: atHour(plusDays(dayW, -2), bestHour.h, bestHour.m).toISOString(), text: reminderText.trim() })
        if (tonight && tonightText.trim()) out.push({ key: `w${w}-tonight`, label: 'Tonight', detail: `Week ${w}, 4 pm`, at: atHour(dayW, 16).toISOString(), text: tonightText.trim() })
      }
    }
    if (isDeal && weekly && dd.from) {
      const first = dd.from; const n = dd.until ? Math.max(1, Math.min(8, Math.floor((new Date(dd.until + 'T12:00:00').getTime() - new Date(first + 'T12:00:00').getTime()) / (7 * 86400e3)) + 1)) : 4
      const hour = fromSlow ? PARTS.find((x) => x.id === part)?.hour ?? 16 : 16
      for (let w = 0; w < n; w++) {
        const dayW = plusDays(first, 7 * w)
        if (tonightText.trim()) { const d = atHour(dayW, 11); if (d.getTime() > Date.now()) out.push({ key: `w${w + 1}-morning`, label: `${DAYS[dealDay()]} morning`, detail: `Week ${w + 1}, 11 am`, at: d.toISOString(), text: tonightText.trim() }) }
        if (story && hasIgFb && media.length) { const d = atHour(dayW, hour); if (d.getTime() > Date.now()) out.push({ key: `w${w + 1}-story`, label: 'Story', detail: `Week ${w + 1}, ${clock(`${pad(hour)}:00`)}`, at: d.toISOString(), text: tonightText.trim() || social.trim(), story: true }) }
      }
    }
    if (spanish && socialEs.trim()) { const d = new Date((postAt ?? new Date()).getTime() + 2 * 3600e3); out.push({ key: 'spanish', label: 'In Spanish', detail: 'Its own post, two hours after', at: d.toISOString(), text: socialEs.trim() }) }
    if (kind?.id === 'hiring' && again) { const d = new Date((postAt ?? new Date()).getTime() + 14 * 86400e3); out.push({ key: 'again2', label: 'Posted a third time', detail: 'Two weeks on, until it is filled', at: d.toISOString(), text: social.trim() }) }
    return out
  }
  const write = async (stay = false): Promise<{ social: string; google: string; card: string } | null> => {
    if (!kind) return null
    setWriting(true); if (!stay) setErr(null)
    try {
      const r = await fetch('/api/dashboard/announce-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: kind.id, answers: factsOut(), channels, cta: ctaEff, languages: spanish ? ['es'] : [], card: also.has('team'), reminderWhen: reminderWhen()?.phrase ?? '', tonight: (isEvent && tonight) || (isDeal && weekly), after: isEvent && after, ctaText: isEvent ? GETIN.find((x) => x.id === getin)?.cta : isDeal && a.code?.trim() ? `Say ${a.code.trim()} at the counter` : '' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not write it')
      setSocial(String(j.social ?? '')); setGtext(String(j.google ?? '')); setCard(String(j.card ?? '')); setReminderText(String(j.reminder ?? '')); setTonightText(String(j.tonight ?? '')); setAfterText(String(j.after ?? '')); setSocialEs(String(j.socialEs ?? ''))
      if (!stay) setStep('words')
      setWriting(false)
      return { social: String(j.social ?? ''), google: String(j.google ?? ''), card: String(j.card ?? '') }
    } catch (e) { if (!stay) setErr(e instanceof Error ? e.message : 'Could not write it') }
    setWriting(false)
    return null
  }

  /* the plan as the owner will read it, before anything is made; the server sends back the real one */
  const preview = useMemo((): PlanLine[] => {
    if (!kind) return []
    const L: PlanLine[] = []
    const line = (key: string, label: string, detail: string, date: string | null, cost: number | null = null, status: PlanLine['status'] = 'with_team', why?: string) => L.push({ key, label, detail, date, cost, status, ref: null, why })
    const lead = leadDefault()
    const today = todayIso()
    const pieceDue = readyBy || plusDays(shootLead, 3)
    if (src === 'newshoot') line('shootday', 'Book the shoot day', `${TIERS.find((t) => t.id === tier)?.label ?? ''}: ${sizeOf(listN)}. Pay to book it`, shootDate || null, tierCents(tier), 'needs_payment', 'Add to the list until the day. The price follows the list')
    if (src === 'shoot' && !openShoot) line('shootday', 'On the next content day', 'Not booked yet. We book it when the list is worth the visit, or with your monthly plan. Nothing to pay now', ctx?.planShoot ?? null, null, 'later', 'No day to pay for yet')
    if (src === 'shoot' && openShoot) { const n = openShoot.used + 1; line('shootday', `On the ${openShoot.date ? niceDate(openShoot.date) : 'booked'} shoot`, `Yours makes ${n} thing${n === 1 ? '' : 's'} on the list. Already booked`, openShoot.date, null, 'with_team', 'No new day to pay for'); if (n > openShoot.spots) { const nt = tierFor(n); const up = tierCents(nt) != null && tierCents(openShoot.tier) != null ? (tierCents(nt) as number) - (tierCents(openShoot.tier) as number) : null; line('upgrade', `That makes it ${TIERS.find((t) => t.id === nt)?.label.toLowerCase()}`, `${n} things is more than ${openShoot.tierLabel.toLowerCase()} covers. About ${TIERS.find((t) => t.id === nt)?.photos} photos. The team confirms with you before the day`, openShoot.date, up, 'with_team', 'Nothing is charged until you agree the bigger day') } }
    if (pieces.has('graphic')) line('graphic', onShoot ? 'The graphic, from the shoot' : 'We start the graphic', onShoot ? `Once the photos land${priceOn && a.price ? ', price on it' : ''}` : media.length ? `From your ${media.length === 1 ? 'photo' : `${media.length} photos`}${priceOn && a.price ? ', price on it' : ''}` : 'From our own photos', onShoot ? pieceDue : today, ctx?.prices.graphic ?? null, 'with_team', isEvent ? 'A night needs the date on the picture' : a.price ? 'A price on the picture is what people remember' : undefined)
    if (pieces.has('reel')) line('video', onShoot ? 'The Reel, from the shoot' : 'The video', onShoot ? 'Cut from the clips we film that day' : 'Pay to start. Then the team takes it', pieceDue, ctx?.prices.video ?? null, onShoot ? 'with_team' : 'needs_payment', 'Reels reach further than photos')
    if (pieces.has('photos') && onShoot) line('photos', 'Photos in your library', `${a.what || 'It'}, edited, tagged with the day`, pieceDue, null, 'later')
    if (madeLater) line('approve', pieces.size > 1 ? 'You approve each piece' : onShoot && !Array.from(pieces).some((p) => p !== 'photos') ? 'You pick the shot' : 'You approve it', 'One tap in Coming up', pieceDue, null, 'later')
    const hour = postAt ? postAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'now'
    if (platforms.length) {
      const igNeeds = igChosen && media.length === 0 && !madeLater
      const who = (a.who ?? '').match(/@[A-Za-z0-9._]+/g)
      line('post', platforms.map((p) => PLAT[p] ?? p).join(', '), `${madeLater ? `Once you approve the picture, ${hour}` : igNeeds ? 'Instagram needs a photo. The team adds one, then posts' : postNow ? 'Right now' : `${hour}${bests.length ? ', your best hour' : ''}`}${who?.length ? `. With ${who.join(' ')}, so it shows on their profile too` : ''}`, postDay, null, madeLater || igNeeds ? 'with_team' : postNow ? 'done' : 'scheduled', timing === 'by' && !postByTouched ? lead.why : undefined)
      if (story && hasIgFb) line('story', 'Story goes up', madeLater ? 'Same day, once the picture is in' : 'An hour after the post', postDay, null, madeLater ? 'with_team' : 'scheduled')
      if (again) line('again', 'Posted again', kind.id === 'hiring' ? 'A week later, until it is filled' : 'A week later, for the ones who missed it', plusDays(postDay, 7), null, madeLater ? 'with_team' : 'scheduled')
    }
    if (google) line('google', 'Google', ctx?.pro && postNow && !madeLater ? 'Right now' : madeLater ? 'Once the picture is in' : ctx?.pro === false ? 'The team posts it for you' : 'The team posts it on the day', postDay, null, ctx?.pro && postNow && !madeLater ? 'done' : 'with_team')
    const menus = (['gmenu', 'sitemenu', 'apps'] as Also[]).filter((x) => also.has(x))
    if (menus.length) line('menus', menus.map((x) => ALSO[x].label).join(', '), `Name${media.length ? ', photo' : ''}${a.price ? `, ${a.price}` : ''}`, postDay)
    if (hoursOn && (a.from || a.date)) line('ghours-google', 'Google hours set', closed ? `Closed ${niceDate(a.date || a.from)}` : `${clock(openAt)} to ${clock(closeAt)} on ${niceDate(a.date || a.from)}`, todayIso(), null, 'done')
    if (also.has('ghours')) line('ghours', kind.alsoLabels?.ghours?.label ?? 'Hours updated everywhere', hoursOn ? 'The website and the delivery apps' : 'Google, the website, the delivery apps', a.from || a.date || postDay)
    if (platforms.length) {
      const xs = extras()
      for (const x of xs.filter((x) => !/^w\d/.test(x.key))) line(x.key, x.label, madeLater ? `${x.detail}. The team posts it` : x.detail, x.at.slice(0, 10), null, madeLater ? 'with_team' : 'scheduled')
      const wk = xs.filter((x) => /^w\d/.test(x.key))
      if (wk.length && isDeal) { const n = new Set(wk.map((x) => x.key.split('-')[0])).size; line('weekly', `Every ${DAYS[dealDay()]} for ${n} weeks`, `A post at 11${wk.some((x) => x.story) ? ', a Story that afternoon' : ''}${boost ? `, Boost $${Math.round(boostCents / 100)} that afternoon` : ''}`, wk[0].at.slice(0, 10), boost ? boostCents * n : null, madeLater ? 'with_team' : 'scheduled', boost ? `$${Math.round(boostCents / 100) * n} over the run. If it brings ${Math.max(1, Math.round(boostCents / tableCents))} table${Math.round(boostCents / tableCents) === 1 ? '' : 's'} a week it paid for itself` : 'People decide dinner that afternoon') }
      else if (wk.length) line('weekly', 'Every week from then on', `${wk.length} more posts over the next 4 weeks${madeLater ? ', the team posts them' : ''}. Announce again to extend, cancel any in Coming up`, wk[0].at.slice(0, 10), null, madeLater ? 'with_team' : 'scheduled')
    }
    if (also.has('ordering')) line('ordering', 'Online ordering', 'Added so Order online works', postDay)
    if (also.has('email')) line('email', ctx && ctx.guests > 0 ? `Email to ${ctx.guests.toLocaleString()} regulars` : 'Email to your regulars', 'Written from the same words', plusDays(postDay, 1), null, 'with_team', ctx && ctx.guests > 0 ? `${ctx.guests.toLocaleString()} people who already like you. The cheapest seats you will fill` : undefined)
    if (also.has('print')) line('print', kind.alsoLabels?.print?.label ?? 'Table tent', 'The team quotes it, printed or a file', postDay, null, 'with_team', isDeal ? 'The people already inside tell friends' : undefined)
    if (also.has('gattr')) line('gattr', 'Google listing says happy hour', 'The attribute, so it shows in search', postDay)
    if (also.has('banner')) line('banner', 'Website banner', 'On the home page, on the day', postDay)
    if (also.has('pos')) line('pos', 'The register has the button', 'One tap for the team, and it counts', postDay)
    if (also.has('fbevent')) line('fbevent', 'Facebook Event', 'The team makes it. Going spreads it', postDay, null, 'with_team', 'Going is how friends find out')
    if (also.has('sitepage')) line('sitepage', 'Website events page', 'Added with the date and the link', postDay)
    if (also.has('team')) line('team', 'Team card', 'To everyone on the portal, and one to copy', today, null, 'done')
    if (boost && !(isDeal && weekly)) line('boost', isEvent ? 'Boost the announcement' : 'Boost it', `$${Math.round(boostCents / 100)}, about ${(Math.round(boostCents / 100) * REACH_PER_DOLLAR).toLocaleString()} people nearby`, postDay, boostCents, 'later', isEvent && goal >= 25 ? `You want ${goal === 999 ? 'a full house' : `${goal} more people`}. Your own followers will not get you there alone` : undefined)
    if (also.has('creators')) { const i = L.findIndex((l) => l.key === 'creators'); if (i < 0) line('creators', 'Two creators invited', 'Comped seats, they post from the room', rawDates().when ?? postDay, null, 'with_team', goal >= 50 ? 'A big night needs other people telling it' : undefined) }
    if (weekly && (isDeal || isEvent) && (rawDates().from || rawDates().when)) line('checkin', 'The check-in', `${DAYS[isDeal ? dealDay() : new Date(rawDates().when + 'T12:00:00').getDay()]} sales against the four before${isDeal && a.code?.trim() ? `, and how many said ${a.code.trim()}` : ''}`, plusDays(rawDates().from || rawDates().when, 28), null, 'later', 'Keep it, change it, or stop it, with the numbers')
    else line('results', 'How it did', isEvent ? 'Views, RSVPs and mentions, in Insights' : 'Views, saves and mentions, in Insights', plusDays((isEvent && rawDates().when) || postDay, 7), null, 'later')
    return L
  }, [kind, src, pieces, tier, listN, alsoShoot, shootDate, openShoot, shootLead, onShoot, media, priceOn, a, ctx, readyBy, postAt, platforms, igChosen, madeLater, postNow, bests, story, hasIgFb, again, postDay, google, also, boost, boostCents, goal, spanish, socialEs, reminder, reminderText, oneDay, closed, openAt, closeAt, ekind, weekly, getin, link, price, where, address, tonight, after, tonightText, afterText, timing, postByTouched, night, part, slowWords, tables, fromSlow]) // eslint-disable-line react-hooks/exhaustive-deps
  const previewTotal = preview.reduce((s, l) => s + (l.cost ?? 0), 0)

  const commit = async (fresh?: { social: string; google: string; card: string } | null) => {
    if (posting || !kind) return
    const wS = fresh?.social ?? social, wG = fresh?.google ?? gtext, wC = fresh?.card ?? card
    setPosting(true); setErr(null)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    try {
      const r = await fetch('/api/dashboard/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        clientId, kind: kind.id, answers: factsOut(),
        picture: { src, pieces: [...pieces], mediaUrls: media.map((m) => m.url), priceOn, brandKit, readyBy: readyBy || undefined, shootId: ctx?.shoot?.id, nextShootId: ctx?.nextShoot?.id, queue: src === 'shoot' && !openShoot ? true : undefined, tier, alsoShoot: alsoItems, shootDate: shootDate || undefined },
        places: { accountIds: [...chosen], google, story: story && hasIgFb, also: [...also] },
        timing: { at: postNow ? null : postAt?.toISOString() ?? null, timezone: tz, again, boost, boostCents, reminders: extras() },
        whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])),
        items: simple ? items.filter((x) => x.on).map((x) => ({ id: x.id, uid: x.uid, on: true, options: x.options, why: x.why, cents: itemCents(x, prices) })) : undefined,
        words: { social: wS.trim(), google: wG.trim(), cta: ctaEff, languages: spanish ? ['es'] : [], card: also.has('team') ? wC.trim() : '' },
        dates: rawDates(),
        hours: hoursOn ? { oneDay: true, closed, open: openAt, close: closeAt } : undefined,
      }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not make it happen')
      setResult({ plan: Array.isArray(j.plan) ? j.plan : [], errors: Array.isArray(j.errors) ? j.errors : [], total: Number(j.total) || 0 })
      setStep('done')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not make it happen') }
    setPosting(false)
  }

  /* hooks that need the plan helpers below run through a ref, so they sit above the early return */
  const simpleKind = !!kind && !isSlow && !kind.hidden
  const helpers = useRef<{ write: (stay?: boolean) => Promise<unknown>; suggest: (budgetCents?: number | null) => Promise<void> } | null>(null)
  useEffect(() => { if ((step === 'words' || step === 'plans') && simpleKind && !social.trim() && !writing) void helpers.current?.write(true) }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  /* the picker runs when the kind opens, and again when a photo lands */
  useEffect(() => {
    if (step !== 'content' && !(step === 'facts' && dishRows)) return
    if (library === null) { void fetch(`/api/dashboard/assets?clientId=${encodeURIComponent(clientId)}`).then((r) => (r.ok ? r.json() : { photos: [] })).then((j) => setLibrary((j.photos ?? []) as { id: string; name: string; url: string }[])).catch(() => setLibrary([])) }
    if (step === 'content' && content === null) setContent(derivedContent)
    if (content === null) { setWantVideo(!!it('video')?.on); setWantGraphic(it('graphic')?.on !== false) }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  /* the choice writes the lines the plan reads: the shoot on or off, where the graphic comes from, the Reel */
  const derivedContent: Content = src === 'newshoot' ? 'newshoot' : src === 'shoot' ? 'shoot' : src === 'own' ? 'own' : src === 'team' ? 'stock' : media.length ? 'own' : 'stock'
  const applyContent = () => {
    const c = content ?? derivedContent
    const shoot = c === 'newshoot' || c === 'shoot'
    const extra = dishes.map((d) => d.name.trim()).filter(Boolean)
    const list = [...new Set([...extra, ...alsoItems])]
    setItems((xs) => xs.map((it) => {
      if (it.uid !== it.id) return it
      if (it.id === 'photos') return shoot ? { ...it, on: true, options: { ...it.options, list, date: c === 'newshoot' ? shootDate : '', newDay: c === 'newshoot' && !!openShoot, queue: c === 'shoot' && !openShoot, reel: wantVideo } } : { ...it, on: false, options: { ...it.options, newDay: false, queue: false } }
      if (it.id === 'graphic') return c === 'none' || !wantGraphic ? { ...it, on: false } : { ...it, on: true, options: { ...it.options, from: shoot ? 'shoot' : c === 'own' || c === 'library' ? 'own' : 'stock' } }
      if (it.id === 'video') return c === 'none' || !wantVideo ? { ...it, on: false } : { ...it, on: true, options: { ...it.options, filmed: shoot ? 'shoot' : (c === 'own' || c === 'library') && media.some((m) => m.video) ? 'clips' : c === 'own' || c === 'library' ? 'clips' : 'visit' } }
      return it
    }))
  }
  const keepLines = content === 'none' ? [] : [...(content === 'newshoot' || content === 'shoot' ? ['photos'] : []), ...(wantVideo ? ['video'] : []), ...(wantGraphic ? ['graphic'] : [])]
  const pickLibrary = (ph: { id: string; url: string }) => {
    setLibSel((st) => { const n = new Set(st); if (n.has(ph.id)) n.delete(ph.id); else n.add(ph.id); return n })
    setMedia((m) => (m.some((x) => x.url === ph.url) ? m.filter((x) => x.url !== ph.url) : [...m, { url: ph.url, preview: ph.url, video: false }]))
  }
  useEffect(() => { if (step === 'facts' && simpleKind && kind && suggested !== `${kind.id}:${media.length}:${a.picsrc ?? ''}`) void helpers.current?.suggest() }, [step, kind?.id, media.length, a.picsrc]) // eslint-disable-line react-hooks/exhaustive-deps
  /* ── the menu ── */
  const usual = ctx?.usualReach ?? null
  const prices: MenuPrices = { graphic: ctx?.prices.graphic ?? 23100, video: ctx?.prices.video ?? 27500, print: 2500, shootFor: (n) => tierCents(tierFor(n)) ?? ctx?.prices.shoot ?? 38500, shootLabel: (n) => `${TIERS.find((t) => t.id === tierFor(n))?.label}: ${sizeOf(n)}` }
  const it = (id: ItemId) => items.find((x) => x.id === id && x.on) ?? items.find((x) => x.id === id)
  const onIt = (id: ItemId) => items.some((x) => x.id === id && x.on)
  const linesOn = (id: ItemId) => items.filter((x) => x.id === id && x.on)
  const total = items.filter((x) => x.on).reduce((s, x) => s + itemCents(x, prices), 0)
  const reachEst = useMemo((): number | null => {
    const base = usual?.median ?? null
    let r = base == null ? 0 : onIt('video') ? base * 2 : base
    if (onIt('boost')) r += Math.round((Number(it('boost')?.options.cents) || 2000) / 100) * REACH_PER_DOLLAR
    if (onIt('creator') && me?.creator?.nearby) r += me.creator.nearby
    return r || null
  }, [items, usual, me]) // eslint-disable-line react-hooks/exhaustive-deps
  /* the items set the same state the rails read */
  useEffect(() => {
    if (!items.length || !kind) return
    const g = it('graphic'), v = it('video'), ph = it('photos'), b = it('boost')
    const p = new Set<Piece>()
    if (g?.on) p.add('graphic'); if (v?.on) p.add('reel')
    let nextSrc: Src = media.length ? 'own' : 'words'
    if (ph?.on || v?.on && v.options.filmed === 'shoot' || g?.on && g.options.from === 'shoot') { nextSrc = ph?.options.queue || (openShoot && !ph?.options.newDay) ? 'shoot' : 'newshoot'; p.add('photos'); setAlsoShoot(((ph?.options.list as string[]) ?? []).join(', ')); setShootDate(String(ph?.options.date ?? '')) }
    else if (g?.on) nextSrc = g.options.from === 'own' && media.length ? 'own' : 'team'
    setSrc(nextSrc); setPieces(p); settle(nextSrc, p); setWithReel(!!v?.on)
    setPic(nextSrc === 'newshoot' ? 'shoot' : nextSrc === 'shoot' ? 'booked' : nextSrc === 'team' ? 'graphic' : nextSrc === 'own' ? 'own' : 'words')
    setPriceOn(g?.options.priceOn !== false); setBrandKit(g?.options.brandKit !== false); setSpanish(!!g?.options.spanish)
    setBoost(!!b?.on); if (b?.on) setBoostCents(Number(b.options.cents) || 2000); setAgain(!!b?.on && kind.id !== 'hours' && kind.id !== 'holiday')
    const alsoSet = new Set<Also>(kind.also.filter((k) => ALSO[k].on(ctx)))
    if (kind.also.includes('gmenu')) alsoSet.add('gmenu'); if (kind.also.includes('sitemenu') && ctx?.website) alsoSet.add('sitemenu')
    if (onIt('print') || linesOn('graphic').some((x) => ((x.options.where as string[]) ?? []).some((w) => w === 'tent' || w === 'poster'))) alsoSet.add('print')
    if (it('apps')?.on) alsoSet.add('apps')
    setAlso(alsoSet); setStory(nextSrc !== 'words')
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps
  const suggest = async (budgetCents?: number | null) => {
    if (!kind) return
    setSuggested(`${kind.id}:${media.length}:${a.picsrc ?? ''}`)
    try {
      const r = await fetch('/api/dashboard/announce-suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: kind.id, facts: { price: a.price ?? null, hasMedia: media.length > 0, hasVideo: media.some((m) => m.video), limited, date: a.when ?? a.from ?? null, what: a.what ?? null, source: media.length ? 'mine' : (a.picsrc as 'licensed' | 'shoot' | 'none' | undefined) ?? 'none', look: a.look ?? null }, ...(budgetCents != null ? { budgetCents } : {}) }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok && Array.isArray(j.items)) { setItems(j.items); setMe(j.me ?? null) }
    } catch { /* the menu still works by hand */ }
  }
  const pickForBudget = () => { const cents = Math.round(Number(budget.replace(/[^0-9.]/g, '')) * 100); if (Number.isFinite(cents) && cents >= 0) void suggest(cents) }
  helpers.current = { write, suggest }
  if (!mounted) return null
  const hue = kind?.hue ?? '#2e9a78'
  const hv = (h: string): React.CSSProperties => ({ ['--c1' as string]: h, ['--c2' as string]: h, ['--t1' as string]: hexa(h, 0.14) } as React.CSSProperties)
  const input: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14.5, fontWeight: 500, color: C.ink, background: '#fff', font: 'inherit', boxSizing: 'border-box', outline: 'none' }
  const chip = (on: boolean, disabled = false): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'default' : 'pointer', font: 'inherit', opacity: disabled ? .5 : 1 })
  const cta_: React.CSSProperties = { marginTop: 18, width: '100%', height: 50, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const h2: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 12px', lineHeight: 1.15 }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, fontWeight: 600 }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const Switch = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} style={{ width: 40, height: 24, borderRadius: 99, border: 0, background: on ? C.greenDk : C.line, position: 'relative', flex: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} />
    </button>
  )
  const Tick = ({ on }: { on: boolean }) => <span style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{on && <Check size={14} strokeWidth={3} />}</span>
  /* HOW IT LOOKS COMES FIRST (owner 2026-09-17): choosing a photo, a graphic or a video is the
     first decision, and the photo lives on that screen, not on the facts. */
  const steps: Step[] = ['picture', 'facts', 'where', 'words', 'plan']
  /* the simple road: facts, three cards, done. The old screens stay reachable from What is inside */
  const simple = !!kind && !isSlow && !kind.hidden
  const dishRows = kind?.id === 'dish' && simple
  const visible: Step[] = isSlow ? ['night', 'play'] : simple ? [...(isEvent ? ['ekind' as Step] : []), 'facts', ...(kind?.picture && kind.id !== 'dish' ? ['content' as Step, 'make' as Step] : []), 'plans'] : [...(isEvent ? ['ekind' as Step] : []), ...steps.filter((s) => s !== 'picture' || kind?.picture)]
  const inside = simple && (step === 'picture' || step === 'where' || step === 'words')
  const back = () => { if (inside) { setStep('plan'); return } if (simple && step === 'plan') { setStep('plans'); return } if (simple && step === 'plans' && openItem) { setOpenItem(null); return } const i = visible.indexOf(step); setStep(i <= 0 ? 'kind' : visible[i - 1]) }
  const next = () => { if (inside) { setStep('plan'); return } const i = visible.indexOf(step); setStep(visible[i + 1]) }
  /* ONE TAP (owner 2026-09-18): Make it happen from the facts screen. The words are written on the
     way if they are not yet, then everything is made. */
  const go = async () => {
    if (posting || writing) return
    const fresh = social.trim() ? null : await write(true)
    if (!social.trim() && !fresh) { setErr('Could not write the words. Open What is inside and write them'); return }
    await commit(fresh)
  }

  const title = step === 'kind' ? 'Announce something' : step === 'done' ? 'Done' : step === 'ekind' ? 'An event' : isSlow ? 'Slow night' : kind?.id === 'post' ? 'A post' : kind?.id === 'update' ? 'Update' : fromSlow && step === 'facts' ? `${DAYS[night]} ${(PARTS.find((p) => p.id === part)?.label ?? 'dinner').toLowerCase()}` : (isEvent && a.what?.trim()) || kind?.label || ''
  const Line = ({ l }: { l: PlanLine }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}{l.ref?.href && l.status === 'needs_payment' && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Pay to start</a>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dollars(l.cost)}</b>}
    </div>
  )
  const madeKind = madeLater
  const mediaStrip = media.length > 0 && (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12 }}>
      {media.map((m, i) => <div key={i} style={{ position: 'relative', flex: 'none', width: 84, height: 84, borderRadius: 14, overflow: 'hidden', background: m.video ? C.ink : `center/cover url(${m.preview})` }}>{m.video && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>Video</span>}<button type="button" aria-label="Remove" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} /></button></div>)}
      {media.length < 10 && <button type="button" onClick={() => fileRef.current?.click()} style={{ flex: 'none', width: 84, height: 84, borderRadius: 14, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{uploading ? <Loader2 size={18} className="mvp-spin" /> : <Plus size={20} />}</button>}
    </div>
  )

  const body = (

    <>
        {page && step !== 'kind' && step !== 'done' && !(initialKind && visible.indexOf(step) === 0) && <button type="button" onClick={back} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 0, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.mute, cursor: 'pointer', padding: '6px 0' }}><ArrowLeft size={14} /> Back</button>}
        {step !== 'kind' && step !== 'done' && visible.length > 1 && <div style={{ display: 'flex', gap: 4, margin: '0 0 14px' }}>{visible.map((s) => <i key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: visible.indexOf(s) <= visible.indexOf(step) ? C.ink : C.line }} />)}</div>}
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />

        <style>{`@keyframes an-fwd{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}@keyframes an-back{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}@keyframes an-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}.an-fwd{animation:an-fwd .26s cubic-bezier(.2,.7,.2,1)}.an-back{animation:an-back .26s cubic-bezier(.2,.7,.2,1)}.an-pop{animation:an-pop .28s cubic-bezier(.2,.7,.2,1)}@media(prefers-reduced-motion:reduce){.an-fwd,.an-back,.an-pop{animation:none}}`}</style>
        <div key={`${step}:${openItem ?? ''}`} className={dir === 'back' ? 'an-back' : 'an-fwd'}>
        {step === 'kind' && (
          <>
            <div style={h2}>What is the news?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
              {KINDS.filter((k) => !k.hidden).map((k) => (
                <button key={k.id} type="button" onClick={() => pick(k)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, ...hv(k.hue) }}>
                  <span style={{ width: '100%', aspectRatio: '1.25', borderRadius: 22, background: hexa(k.hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, boxSizing: 'border-box' }}><span style={{ width: '72%' }}><Drawing spec={{ scene: k.scene }} name="" rating="" t={(s) => s} /></span></span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{k.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>Pick one. A few questions, then we write it, make it and post it where you choose.</div>
          </>
        )}

        {step === 'night' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>Which night is slow?</div>
            {ctx?.weekdays ? (() => { const w = ctx.weekdays!; const max = Math.max(...w.map((x) => x.avgCents), 1); const best = w.reduce((a, b) => (b.avgCents > a.avgCents ? b : a)); const pick_ = w[night]
              return <>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 96, margin: '8px 0 22px' }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const x = w[d]; const on = d === night
                  return <button key={d} type="button" onClick={() => setNight(d)} style={{ flex: 1, height: `${Math.max(6, Math.round((x.avgCents / max) * 100))}%`, background: on ? hue : hexa(hue, 0.18), border: 0, borderRadius: '6px 6px 3px 3px', position: 'relative', cursor: 'pointer', padding: 0 }}><span style={{ position: 'absolute', bottom: -18, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: on ? hue : C.mute }}>{DAYS[d].slice(0, 3)}</span></button> })}</div>
                <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, lineHeight: 1.4 }}>From your register, the last 8 weeks. {DAYS[night]} does {Math.round((pick_.avgCents / Math.max(best.avgCents, 1)) * 100)}% of a {DAYS[best.d]}.</div>
              </> })() : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" onClick={() => setNight(d)} style={chip(night === d)}>{DAYS[d].slice(0, 3)}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Connect your register and this screen shows the week as numbers.</div>
              </>
            )}
            <div style={h3}>Which part of it</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PARTS.map((p) => <button key={p.id} type="button" onClick={() => setPart(p.id)} style={chip(part === p.id)}>{p.label}</button>)}</div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 14 }}>How slow, in your words<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span><input type="text" value={slowWords} onChange={(e) => setSlowWords(e.target.value)} placeholder="Six tables from 5 to 8, mostly regulars" style={input} /></label>
            <button type="button" onClick={next} style={cta_}>Next</button>
          </div>
        )}

        {step === 'play' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>What fills a {DAYS[night]} {(PARTS.find((p) => p.id === part)?.label ?? 'dinner').toLowerCase()}?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { to: 'deal' as const, label: 'A deal that day', small: 'Happy hour, 2 for 1, $ off', scene: 'offer' as Scene, hue: '#d99a1e', why: 'Fastest way to fill a night' },
                { to: 'event' as const, label: 'A weekly night', small: 'Trivia, music, industry night', scene: 'event' as Scene, hue: '#2e73b6', why: 'Builds a habit. Slower to start' },
              ]).map((o) => (
                <button key={o.to} type="button" onClick={() => handoff(o.to)} style={{ ...hv(o.hue), border: `1.5px solid ${C.line}`, borderRadius: 18, padding: '14px 10px 12px', textAlign: 'center', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink }}>
                  <span style={{ display: 'block', width: 64, margin: '0 auto 8px' }}><Drawing spec={{ scene: o.scene }} name="" rating="" t={(s) => s} /></span>
                  <b style={{ display: 'block', fontSize: 14, lineHeight: 1.2 }}>{o.label}</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 3 }}>{o.small}</small><small style={{ display: 'block', color: C.greenDk, fontSize: 11, fontWeight: 700, marginTop: 6 }}>{o.why}</small>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>Either one runs every {DAYS[night]}, with a check-in against the register after four weeks. Something else? Announce it.</div>
            <button type="button" onClick={() => { setKind(null); setStep('kind') }} style={{ ...cta_, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Announce something else</button>
          </div>
        )}

        {step === 'ekind' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>What kind of night?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {EVENT_KINDS.map((e) => (
                <button key={e.id} type="button" onClick={() => pickEvent(e)} style={{ ...hv(e.hue), border: `1.5px solid ${ekind?.id === e.id ? C.ink : C.line}`, borderRadius: 18, padding: '12px 10px 10px', textAlign: 'center', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink }}>
                  <span style={{ display: 'block', width: 54, margin: '0 auto 6px' }}><Drawing spec={{ scene: e.scene }} name="" rating="" t={(s) => s} /></span>
                  <b style={{ display: 'block', fontSize: 13.5, lineHeight: 1.2 }}>{e.label}</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 3 }}>{e.small}</small>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>The kind of night sets the defaults. Change any of them next.</div>
          </div>
        )}

        {step === 'facts' && kind && (
          <div style={hv(hue)}>
            {!openItem && <div style={h2}>{kind.id === 'dish' ? 'What is new?' : 'Tell us about it'}</div>}
            {!openItem && <>
            {kind.photo && (!kind.picture || simple) && (
              <div style={{ margin: '4px 0 6px' }}>
                {media.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                    {media.map((m, i) => <div key={i} style={{ position: 'relative', flex: 'none', width: 96, height: 96, borderRadius: 14, overflow: 'hidden', background: m.video ? C.ink : `center/cover url(${m.preview})` }}>{m.video && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>Video</span>}<button type="button" aria-label="Remove" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} /></button></div>)}
                    {media.length < 10 && <button type="button" onClick={() => fileRef.current?.click()} style={{ flex: 'none', width: 96, height: 96, borderRadius: 14, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{uploading ? <Loader2 size={18} className="mvp-spin" /> : <Plus size={20} />}</button>}
                  </div>
                ) : simple ? null : (
                  <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 118, borderRadius: 18, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'pointer', font: 'inherit', color: C.ink }}>
                    {uploading ? <Loader2 size={22} className="mvp-spin" color={hue} /> : <><span style={{ width: 64 }}><Drawing spec={{ scene: 'photos' }} name="" rating="" t={(s) => s} /></span><span style={{ textAlign: 'left' }}><b style={{ fontSize: 14 }}>Add a photo or video</b><small style={sub}>Optional. Every plan can make one.</small></span></>}
                  </button>
                )}
              </div>
            )}
            {/* THE DISH FORM (owner 2026-09-22, "one form"): the cloche tile, then one card that runs from Name,
               Price and Description straight into the details, each detail a row whose answer sits on the right
               and opens one small picker. More dishes are added on the next page. */}
            {dishRows && (() => {
              const fromSet = !!a.from && a.from !== isoPlus(0)
              const effContent = content ?? derivedContent
              const contentUI = (() => {
          const c = effContent
          const opt = (id: Content, label: string, small: string, scene: Scene, hue: string, first: boolean, body?: React.ReactNode) => (
            <div key={id}>
              <button type="button" onClick={() => { setContent(id); if ((id === 'newshoot' || id === 'shoot') && c !== 'newshoot' && c !== 'shoot') setWantVideo(true) }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 14px', border: 0, borderTop: first ? 0 : `0.5px solid ${C.line}`, background: 'none', font: 'inherit', color: C.ink, cursor: 'pointer' }}>
                <span style={{ ...hv(hue), width: 44, height: 44, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--t1)' }}><span style={{ width: 32 }}><Drawing spec={{ scene }} name="" rating="" t={(s) => s} /></span></span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 15 }}>{label}</b><small style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2 }}>{small}</small></span>
                <span style={{ width: 22, height: 22, borderRadius: 99, border: `1.5px solid ${c === id ? C.greenDk : C.line}`, background: c === id ? C.greenDk : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>{c === id && <span style={{ width: 8, height: 8, borderRadius: 99, background: '#fff' }} />}</span>
              </button>
              {c === id && body && <div style={{ padding: '0 14px 14px 70px' }}>{body}</div>}
            </div>
          )
          const ownBody = (
            <div>
              {mediaStrip}
              <button type="button" onClick={() => fileRef.current?.click()} style={{ ...chip(false), marginTop: media.length ? 8 : 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{uploading ? <Loader2 size={12} className="mvp-spin" /> : <Plus size={12} />} {media.length ? 'Add another' : 'Add a photo or video'}</button>
              {media[0]?.video && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8 }}>A vertical video becomes a Reel.</div>}
            </div>
          )
          const libBody = (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -14px 0 -70px', padding: '0 14px 2px 70px' }}>
              {(library ?? []).map((ph) => { const on = libSel.has(ph.id); return <button key={ph.id} type="button" onClick={() => pickLibrary(ph)} aria-label={ph.name} style={{ flex: 'none', width: 84, height: 84, borderRadius: 12, border: `2px solid ${on ? C.greenDk : 'transparent'}`, padding: 0, cursor: 'pointer', background: `center/cover url(${ph.url})`, position: 'relative' }}>{on && <span style={{ position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 99, background: C.greenDk, display: 'grid', placeItems: 'center' }}><Check size={12} color="#fff" strokeWidth={3} /></span>}</button> })}
            </div>
          )
          const rows: React.ReactNode[] = []
          rows.push(opt('newshoot', openShoot ? 'Another full content shoot' : 'Full content shoot', 'We come shoot photos and video in one visit', 'creator', '#6a39de', true))
          const queued = !!openShoot && !openShoot.requestId
          rows.push(opt('shoot',
            openShoot && !queued ? `Add to the ${openShoot.date ? niceDate(openShoot.date).replace(/^\w+, /, '') : 'booked'} content shoot` : 'Add to the next content shoot',
            openShoot ? `${openShoot.used ? `${openShoot.used} thing${openShoot.used === 1 ? '' : 's'} ${queued ? 'waiting' : 'on the list already'}` : 'Nothing on the list yet'}${queued && openShoot.date ? `, planned for ${niceDate(openShoot.date).replace(/^\w+, /, '')}` : ''}` : ctx?.planShoot ? `Planned for ${niceDate(ctx.planShoot).replace(/^\w+, /, '')} with your monthly plan` : 'Nothing booked yet. It waits on the list, nothing to pay now',
            'calendar', '#3b6fd4', false))
          rows.push(opt('own', 'My own photos or videos', media.length ? `${media.length} added` : 'From your phone', 'photos', '#2e9a78', false, ownBody))
          if (library && library.length) rows.push(opt('library', 'From my library', `${library.length} photo${library.length === 1 ? '' : 's'} with Apnosh`, 'grid', '#0f97a8', false, libBody))
          rows.push(opt('stock', 'A licensed photo', 'The team picks one in your style', 'graphic', '#d99a1e', false))
          rows.push(opt('none', 'No content needed', igChosen ? 'Words only. Instagram needs a picture, so Google and Facebook' : 'Words only, on Google and Facebook', 'google', '#8a928e', false))
          return <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>{rows}</div>
              })()

              const makeUI = (() => {
                const c = effContent
                if (c === 'none') return null
                const shoot = c === 'newshoot' || c === 'shoot'
                const hasClip = media.some((m) => m.video)
                const vSmall = shoot ? `Filmed on the shoot day · ${dollars(ctx?.prices.video ?? null) || 'Priced'}` : c === 'own' || c === 'library' ? (hasClip ? `A Reel from your clips · ${dollars(ctx?.prices.video ?? null) || 'Priced'}` : `Send ten seconds from your phone · ${dollars(ctx?.prices.video ?? null) || 'Priced'}`) : `We come film it · ${dollars(ctx?.prices.video ?? null) || 'Priced'} + $150`
                const gSmall = `Designed for the post${a.price ? ', with the price on it' : ''} · ${dollars(ctx?.prices.graphic ?? null) || 'Priced'}`
                const mk = (on: boolean, set: () => void, scene: Scene, hue: string, label: string, small: string, first: boolean) => (
                  <button type="button" onClick={set} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 14px', border: 0, borderTop: first ? 0 : `0.5px solid ${C.line}`, background: 'none', font: 'inherit', color: C.ink, cursor: 'pointer' }}>
                    <span style={{ ...hv(hue), width: 44, height: 44, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--t1)' }}><span style={{ width: 32 }}><Drawing spec={{ scene }} name="" rating="" t={(s) => s} /></span></span>
                    <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 15 }}>{label}</b><small style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2 }}>{small}</small></span>
                    <span style={{ width: 22, height: 22, borderRadius: 99, border: `1.5px solid ${on ? C.greenDk : C.line}`, background: on ? C.greenDk : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>{on && <Check size={13} color="#fff" strokeWidth={3} />}</span>
                  </button>
                )
                return (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '14px 0 6px' }}>What we make</div>
                    <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
                      {mk(wantVideo, () => setWantVideo((v) => !v), 'reel', '#0f97a8', 'A video', vSmall, true)}
                      {mk(wantGraphic, () => setWantGraphic((v) => !v), 'graphic', '#d99a1e', 'A graphic', gSmall, false)}
                    </div>
                    {shoot && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8 }}>The edited photos from the day land in your library either way.</div>}
                  </>
                )
              })()

              const contentWord = effContent === 'newshoot' ? 'A content day' : effContent === 'shoot' ? (openShoot && openShoot.requestId ? `The ${openShoot.date ? niceDate(openShoot.date).replace(/^\w+, /, '') : 'booked'} content day` : 'The next content day') : effContent === 'own' ? (media.length ? `${media.length} of yours` : 'My own photos') : effContent === 'library' ? `${libSel.size || ''} from my library`.trim() : effContent === 'stock' ? 'A licensed photo' : 'Words only'
              const row = (k: Exclude<NonNullable<typeof detail>, 'dish'>, label: string, value: string, set: boolean, body: React.ReactNode) => { const open = detail === k; return (
                <div key={k}>
                  <button type="button" onClick={() => setDetail(open ? null : k)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '13px 14px', border: 0, borderTop: `0.5px solid ${C.line}`, background: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, flex: 'none' }}>{label}</span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 14, color: set ? C.greenDk : C.mute, fontWeight: set ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
                    <ChevronRight size={16} color={C.faint} style={{ flex: 'none', marginRight: -4, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                  </button>
                  {open && <div style={{ padding: '0 14px 14px' }}>{body}</div>}
                </div>
              ) }
              const dateBody = (
                <>
                  <input type="date" value={a.from ?? isoPlus(0)} onChange={(e) => setA((x) => ({ ...x, from: e.target.value }))} style={{ ...input, marginTop: 0 }} />
                  <button type="button" onClick={() => { const v = !limited; setLimited(v); if (v && !a.until) setA((x) => ({ ...x, until: plusDays(a.from ?? isoPlus(0), 7) })) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 0 10px', marginTop: 4, border: 0, background: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                    <span><b style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink }}>For a limited time</b><small style={sub}>The posts say so, and we stop when it ends</small></span>
                    <span style={{ width: 22, height: 22, borderRadius: 99, border: `1.5px solid ${limited ? C.greenDk : C.line}`, background: limited ? C.greenDk : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>{limited && <Check size={13} color="#fff" strokeWidth={3} />}</span>
                  </button>
                  {limited && <input type="date" min={a.from ?? isoPlus(0)} value={a.until ?? ''} onChange={(e) => setA((x) => ({ ...x, until: e.target.value }))} style={{ ...input, marginTop: 0 }} />}
                </>
              )
              const tagsBody = <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TAGS.map((t) => <button key={t} type="button" onClick={() => setTags((st) => { const n = new Set(st); if (n.has(t)) n.delete(t); else n.add(t); return n })} style={chip(tags.has(t))}>{t}</button>)}</div>
              const noteBody = <textarea rows={3} autoFocus value={a.note ?? ''} onChange={(e) => setA((x) => ({ ...x, note: e.target.value }))} placeholder="The chef is off Tuesdays. Use the blue plates." style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.45 }} />
              return (
                <div>
                  <div style={{ marginTop: 4, borderRadius: 22, background: 'var(--t1)', height: 150, display: 'grid', placeItems: 'center' }}>
                    <span style={{ width: 132 }}><Drawing spec={{ scene: 'dish' }} name="" rating="" t={(s) => s} /></span>
                  </div>
                  <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 18, marginTop: 10, background: '#fff', overflow: 'hidden' }}>
                    {dishRow('Name', a.what ?? '', (v) => setA((x) => ({ ...x, what: v })), 'Pork belly bánh mì', true)}
                    {dishRow('Price', a.price ?? '', (v) => setA((x) => ({ ...x, price: v })), '14', false, true)}
                    {dishRow('Description', a.line ?? '', (v) => setA((x) => ({ ...x, line: v })), 'A line about it')}
                    {row('content', 'Content', contentWord, content !== null, <>{contentUI}{makeUI}</>)}
                    {row('from', 'Starting date', `${fromSet ? niceDate(a.from ?? null) : 'Today'}${limited && a.until ? `, until ${niceDate(a.until)}` : ''}`, fromSet || limited, dateBody)}
                    {row('tags', 'Good to know', tags.size ? [...tags].join(', ') : 'Nothing to add', tags.size > 0, tagsBody)}
                    {row('note', 'Additional comments', (a.note ?? '').trim() ? (a.note ?? '') : 'None', !!(a.note ?? '').trim(), noteBody)}
                  </div>
                </div>
              )
            })()}
            {kind.fields.filter((f) => !(dishRows && ['what', 'line', 'price', 'from'].includes(f.key))).filter((f) => !(f.key === 'until' && kind.hours === 'oneday' && oneDay)).filter((f) => !(simple && !moreOpen && ((f.kind === 'date' && ['from', 'until', 'deadline'].includes(f.key) && (f.optional || (a[f.key] ?? '').trim())) || (f.optional && f.key !== 'price')))).map((f) => (
              <label key={f.key} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
                {f.label}{f.optional && <span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span>}
                {f.kind === 'date' ? <input type="date" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={input} />
                  : f.kind === 'long' ? <textarea rows={3} value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={{ ...input, resize: 'none', lineHeight: 1.45 }} />
                  : <input type="text" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={f.key === 'what' && simple ? { ...input, fontSize: 20, fontWeight: 600, padding: '14px 14px', borderRadius: 16 } : input} />}
              </label>
            ))}
            {isEvent && (
              <>
                <div style={{ ...rowS, marginTop: 8 }}><span>Every week<small style={sub}>Same day, same time. We post each week</small></span><Switch on={weekly} set={setWeekly} /></div>
                <div style={h3}>Getting in</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{GETIN.map((g) => <button key={g.id} type="button" onClick={() => setGetin(g.id)} style={chip(getin === g.id)}>{g.label}</button>)}</div>
                {getin === 'tickets' && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>How much?<input type="text" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$10, or $25 with a drink" style={input} /></label>}
                {(getin === 'tickets' || getin === 'rsvp') && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{getin === 'tickets' ? 'Where to buy them' : 'Where to RSVP'}<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span><input type="url" value={link} onChange={(e) => setLink(e.target.value.trim())} placeholder="https://" style={input} /></label>}
                {getin === 'book' && !ctx?.reserveUrl && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>No booking link on file, so the button says Book a table and the post says to call or come in.</div>}
                <div style={h3}>How many people do you want?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{GOALS.map((g) => <button key={g.id} type="button" onClick={() => applyGoal(g.id)} style={chip(goal === g.id)}>{g.label}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>{goal >= 50 ? 'A big night: Boost goes on and two creators get invited. Change any of it next.' : goal >= 25 ? 'Boost goes on for this one. Change it next.' : 'Your own followers and the regulars can fill this. Nothing paid.'}</div>
                <div style={h3}>Where</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{([['here', 'Here'], ['patio', 'The patio'], ['else', 'Somewhere else']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => setWhere(id)} style={chip(where === id)}>{l}</button>)}</div>
                {where === 'else' && <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="The park across the street, or an address" style={input} />}
                <div style={h3}>Good to know</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{EVENT_TAGS.map((t) => <button key={t} type="button" onClick={() => setTags((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })} style={chip(tags.has(t))}>{t}</button>)}</div>
              </>
            )}
            {kind.hours && (
              <>
                {kind.hours === 'oneday' && <div style={{ ...rowS, marginTop: 8 }}><span>Just that one day<small style={sub}>We set it on Google straight away</small></span><Switch on={oneDay} set={setOneDay} /></div>}
                {hoursOn && <div style={rowS}><span>Closed that day</span><Switch on={closed} set={setClosed} /></div>}
                {hoursOn && !closed && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Open<input type="time" value={openAt} onChange={(e) => setOpenAt(e.target.value)} style={input} /></label><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Close<input type="time" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} style={input} /></label></div>}
              </>
            )}
            {isDeal && (
              <>
                {breakEven() && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10, lineHeight: 1.4 }}>{breakEven()}</div>}
                <div style={{ ...rowS, marginTop: 8 }}><span>Every week<small style={sub}>Same day each week until it ends. We post each week</small></span><Switch on={weekly} set={setWeekly} /></div>
                {weekly && (
                  <>
                    <div style={h3}>How many more tables a night?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{[5, 10, 20, 999].map((n) => <button key={n} type="button" onClick={() => setTables(n)} style={chip(tables === n)}>{n === 999 ? 'Full' : `+${n}`}</button>)}</div>
                    <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{tables === 999 ? 'A full room' : `${tables} more tables`} is about ${((tables === 999 ? 30 : tables) * tableCents / 100).toLocaleString()} more a night{ctx?.avgTicketCents ? ', from your average ticket' : ''}. Worth a deal that costs ${Math.round((tables === 999 ? 30 : tables) * tableCents / 100 / 5).toLocaleString()}.</div>
                  </>
                )}
              </>
            )}
            {simple && !moreOpen && !dishRows && (kind.limited || kind.tags || kind.fields.some((f) => ['from', 'until', 'deadline'].includes(f.key))) && <button type="button" onClick={() => setMoreOpen(true)} style={{ display: 'block', border: 0, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: C.mute, padding: '10px 0 0', cursor: 'pointer' }}>More details ›</button>}
            {kind.limited && (!simple || moreOpen) && !dishRows && (
              <>
                <div style={{ ...rowS, marginTop: 8 }}><span>For a limited time</span><Switch on={limited} set={setLimited} /></div>
                {limited && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Until when<input type="date" value={a.until ?? ''} onChange={(e) => setA((x) => ({ ...x, until: e.target.value }))} style={input} /></label>}
              </>
            )}
            {simple && moreOpen && !dishRows && (
              <>
                <div style={h3}>The look<span style={{ fontWeight: 500, color: C.faint, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>optional</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{['Bright', 'Warm', 'Moody', 'Minimal', 'Bold', 'Playful', 'Like my brand kit'].map((t) => <button key={t} type="button" onClick={() => setA((x) => { const cur = (x.look ?? '').split(', ').filter(Boolean); const n = cur.includes(t) ? cur.filter((y) => y !== t) : [...cur, t].slice(-3); return { ...x, look: n.join(', ') } })} style={chip((a.look ?? '').split(', ').includes(t))}>{t}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Goes to the designer and the photographer. Up to three.</div>
              </>
            )}
            {kind.tags && (!simple || moreOpen) && !dishRows && (
              <>
                <div style={h3}>Good to know</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TAGS.map((t) => <button key={t} type="button" onClick={() => setTags((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })} style={chip(tags.has(t))}>{t}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Only what you pick is ever said.</div>
              </>
            )}
            {simple && moreOpen && !dishRows && (
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>A note for the team<span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span>
                <input type="text" value={a.note ?? ''} onChange={(e) => setA((x) => ({ ...x, note: e.target.value }))} placeholder="The chef is off Tuesdays. Use the blue plates." style={input} />
              </label>
            )}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            </>}
            {simple && (() => { const cc = content ?? derivedContent; const okay = !dishRows || (cc === 'own' ? media.length > 0 : cc === 'library' ? libSel.size > 0 : true); const can = ready && okay; return <button type="button" onClick={() => { if (dishRows) applyContent(); next() }} disabled={!can} style={{ ...cta_, opacity: can ? 1 : .5 }}>{visible[visible.indexOf('facts') + 1] === 'content' ? 'Next' : 'See my plan'}</button> })()}
            {!simple && <button type="button" onClick={next} disabled={!ready} style={{ ...cta_, opacity: ready ? 1 : .5 }}>Next</button>}
          </div>
        )}

        {step === 'picture' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>Where does the picture come from?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { m: 'own' as Src, label: 'My photos', small: media.length ? `${media.length} added` : 'Tap to add one', scene: 'photos' as Scene, hue: '#2e9a78' },
                ...(openShoot ? [{ m: 'shoot' as Src, label: `The ${openShoot.date ? niceDate(openShoot.date).replace(/^\w+, /, '') : 'booked'} shoot`, small: openShoot.used ? `${openShoot.used} thing${openShoot.used === 1 ? '' : 's'} on the list. Add this` : 'Nothing on the list yet. Add this', scene: 'calendar' as Scene, hue: '#3b6fd4' }] : []),
                { m: 'newshoot' as Src, label: openShoot ? 'Another shoot day' : 'Book a shoot day', small: `from ${dollars(tierCents('standard')) || '$385'} · one visit, a shot list`, scene: 'creator' as Scene, hue: '#6a39de' },
                { m: 'team' as Src, label: 'Our photos', small: 'The team designs from stock', scene: 'graphic' as Scene, hue: '#d99a1e' },
                { m: 'words' as Src, label: 'Words only', small: 'Google and Facebook', scene: 'google' as Scene, hue: '#8a928e' },
              ]).map((o) => (
                <button key={o.m} type="button" onClick={() => { if (o.m === 'own' && media.length === 0) { fileRef.current?.click(); return } choose(o.m) }} style={{ ...hv(o.hue), border: `1.5px solid ${src === o.m ? C.ink : C.line}`, boxShadow: src === o.m ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 18, padding: '12px 10px 10px', textAlign: 'center', background: '#fff', cursor: 'pointer', font: 'inherit', color: C.ink }}>
                  <span style={{ display: 'block', width: 54, margin: '0 auto 6px' }}><Drawing spec={{ scene: o.scene }} name="" rating="" t={(s) => s} /></span>
                  <b style={{ display: 'block', fontSize: 13.5, lineHeight: 1.2 }}>{o.label}</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 3 }}>{o.small}</small>
                </button>
              ))}
            </div>
            {(src === 'own' || media.length > 0) && mediaStrip}

            {src === 'newshoot' && (
              <>
                <div style={h3}>The shot list</div>
                <div style={rowS}><span>1. {a.what?.trim() || kind.label}<small style={sub}>This plan</small></span></div>
                <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginTop: 12 }}>Anything else to shoot that day?<span style={{ fontWeight: 500, color: C.mute, marginLeft: 4 }}>optional</span></label>
                <input value={alsoShoot} onChange={(e) => setAlsoShoot(e.target.value)} placeholder="The patio, the team, the tiramisu" style={input} />
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>{TIERS.find((t) => t.id === tier)?.label}: {sizeOf(listN)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 3, lineHeight: 1.4 }}>One or two things is a quick visit. Three or four is half a day. Five or six is a full day. The price follows the list, and you can add to it until the day.</div>
                <div style={rowS}><span>Shoot day<small style={sub}>Leave it and the team offers two dates</small></span><input type="date" min={plusDays(todayIso(), 3)} value={shootDate} onChange={(e) => setShootDate(e.target.value)} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>
              </>
            )}
            {src === 'shoot' && openShoot && (
              <div style={{ marginTop: 12, border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '10px 12px', fontSize: 12.5 }}>
                <b style={{ display: 'block', fontSize: 13 }}>{openShoot.tierLabel}, about {openShoot.photos} photos. Already booked</b>
                <div style={{ color: C.mute, marginTop: 3 }}>{openShoot.attached.length ? `On the list: ${openShoot.attached.map((x) => x.label).join(', ')}. Yours makes ${openShoot.used + 1}.` : 'Nothing on the list yet. Yours is the first.'}</div>
                {openShoot.used + 1 > openShoot.spots && <div style={{ color: '#8a5a0c', fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>That makes it {TIERS.find((t) => t.id === tierFor(openShoot.used + 1))?.label.toLowerCase()}. The team confirms the bigger day with you before shooting. Nothing is charged until you agree.</div>}
              </div>
            )}

            {src !== 'words' && (
              <>
                <div style={h3}>What gets made</div>
                {([
                  { id: 'graphic' as Piece, label: 'A graphic', small: `${dollars(ctx?.prices.graphic ?? null) || 'Priced'} · post, Story, Google`, on: true },
                  { id: 'reel' as Piece, label: 'A Reel', small: `${dollars(ctx?.prices.video ?? null) || 'Priced'} · ${onShoot ? 'clips from the day' : media.some((m) => m.video) ? 'from your clips' : 'we come film'}`, on: true },
                  { id: 'photos' as Piece, label: 'Edited photos', small: 'In the shoot · your library', on: onShoot },
                ]).filter((p) => p.on).map((p) => (
                  <button key={p.id} type="button" onClick={() => togglePiece(p.id)} style={{ ...rowS, width: '100%', background: 'none', border: 0, borderBottom: `0.5px solid ${C.line}`, font: 'inherit', color: C.ink, cursor: 'pointer', textAlign: 'left' }}><span>{p.label}<small style={sub}>{p.small}</small></span><Tick on={pieces.has(p.id)} /></button>
                ))}
                {src === 'own' && !pieces.size && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Nothing picked: your photo goes up as it is.</div>}
              </>
            )}
            {madeKind && (
              <>
                <div style={h3}>For the team</div>
                {!onShoot && <div style={rowS}><span>Send what you have<small style={sub}>{media.length ? `${media.length} added. Phone photos are fine` : 'Phone photos are fine'}</small></span><button type="button" onClick={() => fileRef.current?.click()} style={chip(false)}>{uploading ? <Loader2 size={12} className="mvp-spin" /> : <Plus size={12} />} Add</button></div>}
                {pieces.has('graphic') && a.price && <div style={rowS}><span>Put the price on it</span><Switch on={priceOn} set={setPriceOn} /></div>}
                {pieces.has('graphic') && <div style={rowS}><span>Match my brand kit</span><Switch on={brandKit} set={setBrandKit} /></div>}
                <div style={rowS}><span>Ready by</span><input type="date" min={minReady()} value={readyBy} onChange={(e) => setReadyBy(e.target.value)} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>
                {(src === 'newshoot' || (pieces.has('reel') && !onShoot)) && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>{src === 'newshoot' ? 'The day' : 'The video'} is paid before it starts. The plan shows the price and a Pay link.</div>}
              </>
            )}
            {src === 'words' && igChosen && <div style={{ fontSize: 12, color: '#8a5a0c', marginTop: 10 }}>Instagram needs a picture. Words only goes to Facebook and Google.</div>}
            {src === 'own' && media[0]?.video && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10 }}>A vertical video becomes a Reel on Instagram and Facebook.</div>}
            {src === 'own' && !pieces.size && !media.some((m) => m.video) && <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>Got ten seconds of video? It becomes a Reel, and Reels reach further than photos.</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={next} disabled={madeKind && !readyBy} style={{ ...cta_, opacity: madeKind && !readyBy ? .5 : 1 }}>{inside ? 'Done' : 'Next'}</button>
          </div>
        )}

        {step === 'where' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>Where and when</div>
            <div style={{ ...h3, marginTop: 4 }}>Post it</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(targets ?? []).map((t) => { const on = chosen.has(t.accountId)
                return <button key={t.accountId} type="button" onClick={() => setChosen((c) => { const n = new Set(c); if (n.has(t.accountId)) n.delete(t.accountId); else n.add(t.accountId); return n })} style={chip(on)}><BrandOrMark provider={t.platform} size={12} /> {PLAT[t.platform] ?? t.platform}</button> })}
              {hasGoogle && <button type="button" onClick={() => setGoogle((g) => !g)} style={chip(google)}><BrandOrMark provider="google" size={12} /> Google</button>}
              {hasIgFb && <button type="button" onClick={() => setStory((s) => !s)} style={chip(story)}>Story</button>}
              {targets && targets.length === 0 && !hasGoogle && <span style={{ fontSize: 12.5, color: C.mute }}>Connect Instagram, Facebook or Google to post.</span>}
            </div>
            {kind.also.length > 0 && (
              <>
                <div style={h3}>Also update</div>
                {kind.also.map((k) => { const d = ALSO[k]; const on = also.has(k)
                  return <button key={k} type="button" onClick={() => setAlso((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })} style={{ ...rowS, width: '100%', background: 'none', border: 0, borderBottom: `0.5px solid ${C.line}`, padding: '9px 0', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: C.ink, ...hv(d.hue) }}>
                    <span style={{ width: 38, flex: 'none' }}><Drawing spec={{ scene: d.scene }} name="" rating="" t={(s) => s} /></span>
                    <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{kind.alsoLabels?.[k]?.label ?? d.label}</b><small style={sub}>{kind.alsoLabels?.[k]?.detail ?? d.detail(ctx)}</small></span>
                    <Tick on={on} />
                  </button> })}
              </>
            )}
            <div style={h3}>When</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" onClick={() => setTiming('ready')} style={chip(timing === 'ready')}>{madeLater ? 'As soon as it is ready' : 'Right now'}</button>
              <button type="button" onClick={() => setTiming('by')} style={chip(timing === 'by')}>Post by a date</button>
              <button type="button" onClick={() => setTiming('at')} style={chip(timing === 'at')}>Pick the time</button>
            </div>
            {timing === 'by' && <div style={{ ...rowS, marginTop: 6 }}><span>Post by<small style={sub}>{bests[0] ? `At ${bests[0].label.replace(/^\w+ at /, '')}, your best hour` : 'At 6 pm'}</small></span><input type="date" min={todayIso()} value={postBy} onChange={(e) => { setPostBy(e.target.value); setPostByTouched(true) }} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>}
            {timing === 'by' && !postByTouched && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 8 }}>{leadDefault().why}</div>}
            {timing === 'at' && <input type="datetime-local" value={atLocal} onChange={(e) => setAtLocal(e.target.value)} style={input} />}
            {timing === 'ready' && madeLater && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>The day after you approve the picture, at your best hour.</div>}
            {isEvent && <div style={h3}>The sequence</div>}
            {isDeal && weekly && <div style={h3}>Every {DAYS[dealDay()]}</div>}
            {isDeal && weekly && <div style={rowS}><span>{DAYS[dealDay()]} morning post, and a Story that afternoon<small style={sub}>Every week until it ends. People decide dinner that afternoon</small></span><Switch on={weekly} set={setWeekly} /></div>}
            {kind.reminder && reminderWhen() && <div style={rowS}><span>{isEvent ? 'Reminder' : 'Remind them'}<small style={sub}>{kind.reminder}</small></span><Switch on={reminder} set={setReminder} /></div>}
            {isEvent && <div style={rowS}><span>Tonight<small style={sub}>A Story the morning of, a post at 4 pm</small></span><Switch on={tonight} set={setTonight} /></div>}
            {isEvent && <div style={rowS}><span>The day after<small style={sub}>Thanks and photos. Ask to come back</small></span><Switch on={after} set={setAfter} /></div>}
            {isEvent && weekly && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Every week: the reminder and the tonight post repeat for the next four weeks. Announce again to extend.</div>}
            {platforms.length > 0 && !isEvent && <div style={rowS}><span>{kind.id === 'hiring' ? 'Post again each week' : 'Post again in a week'}<small style={sub}>{kind.id === 'hiring' ? 'Until it is filled' : 'Most people miss the first one'}</small></span><Switch on={again} set={setAgain} /></div>}
            <div style={{ ...rowS, borderBottom: boost ? 0 : undefined }}><span>{isDeal && weekly ? `Boost on ${DAYS[dealDay()]}s` : isEvent ? 'Boost the announcement' : 'Boost it'}<small style={sub}>{boost ? `$${Math.round(boostCents / 100)} reaches about ${(Math.round(boostCents / 100) * REACH_PER_DOLLAR).toLocaleString()} people nearby` : 'Reach more people nearby, after it posts'}</small></span><Switch on={boost} set={setBoost} /></div>
            {boost && <div style={{ display: 'flex', gap: 6, padding: '0 0 11px', borderBottom: `0.5px solid ${C.line}` }}>{[1000, 2000, 4000, 8000].map((c) => <button key={c} type="button" onClick={() => setBoostCents(c)} style={chip(boostCents === c)}>${c / 100}</button>)}</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={() => (inside ? (social.trim() ? next() : write()) : write())} disabled={writing || channels.length === 0 || (timing === 'at' && !postAt)} style={{ ...cta_, opacity: channels.length === 0 || (timing === 'at' && !postAt) ? .5 : 1 }}>{writing ? <Loader2 size={16} className="mvp-spin" /> : null} {writing ? 'Writing' : inside && social.trim() ? 'Done' : 'Write it for me'}</button>
          </div>
        )}

        {step === 'words' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>The words</div>
            {platforms.length > 0 && (
              <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                {media[0] && !media[0].video ? <div style={{ height: 170, background: `center/cover url(${media[0].preview})` }} /> : <div style={{ height: 110, background: hexa(hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 80 }}><Drawing spec={{ scene: madeLater ? (pieces.has('reel') ? 'reel' : pieces.has('graphic') ? 'graphic' : 'photos') : kind.scene }} name="" rating="" t={(s) => s} /></span></div>}
                <div style={{ padding: '10px 12px 0', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.mute }}>{platforms.map((p) => PLAT[p] ?? p).join(' and ')}</div>
                <textarea value={social} onChange={(e) => setSocial(e.target.value)} rows={5} style={{ display: 'block', width: '100%', border: 0, outline: 0, resize: 'none', padding: '6px 12px 10px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box' }} />
              </div>
            )}
            {google && (
              <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 0', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.mute }}><BrandOrMark provider="google" size={14} /> Google</div>
                <textarea value={gtext} onChange={(e) => setGtext(e.target.value.slice(0, 1500))} rows={3} style={{ display: 'block', width: '100%', border: 0, outline: 0, resize: 'none', padding: '6px 12px 10px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box' }} />
              </div>
            )}
            {reminderText && reminderWhen() && (
              <>
                <div style={h3}>{reminderWhen()!.label}, {reminderWhen()!.detail.toLowerCase()}</div>
                <textarea value={reminderText} onChange={(e) => setReminderText(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
              </>
            )}
            {isDeal && weekly && tonightText && (
              <>
                <div style={h3}>Every {DAYS[dealDay()]} morning</div>
                <textarea value={tonightText} onChange={(e) => setTonightText(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
                <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>Same words every week. Say the day, not the date.</div>
              </>
            )}
            {isEvent && tonightText && (
              <>
                <div style={h3}>Tonight, 4 pm</div>
                <textarea value={tonightText} onChange={(e) => setTonightText(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
              </>
            )}
            {isEvent && afterText && (
              <>
                <div style={h3}>The day after</div>
                <textarea value={afterText} onChange={(e) => setAfterText(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
              </>
            )}
            <div style={h3}>What should they do?</div>
            {isDeal && a.code?.trim() ? <div style={{ fontSize: 13, color: C.mute }}>Say {a.code.trim()} at the counter</div> : isEvent ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{GETIN.map((g) => <button key={g.id} type="button" onClick={() => setGetin(g.id)} style={chip(getin === g.id)}>{g.label}</button>)}</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{CTAS.filter((c) => c.id !== 'order' || ctx?.orderUrl).map((c) => <button key={c.id} type="button" onClick={() => setCta(c.id)} style={chip(ctaEff === c.id)}>{c.label}</button>)}</div>}
            {isEvent && weekly && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Every week uses the same words. Say the day, not the date.</div>}
            <div style={h3}>Language</div>
            <div style={{ display: 'flex', gap: 6 }}><span style={chip(true, true)}>English</span><button type="button" onClick={() => setSpanish((s) => !s)} style={chip(spanish)}>{spanish ? '' : '+ '}Spanish</button></div>
            {spanish && socialEs && <textarea value={socialEs} onChange={(e) => setSocialEs(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 8, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />}
            {spanish && !socialEs && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Tap Again to write the Spanish post. It goes out two hours after the English one.</div>}
            {also.has('team') && (
              <>
                <div style={h3}>The team card</div>
                <textarea value={card} onChange={(e) => setCard(e.target.value.slice(0, 1200))} rows={4} placeholder="What it is, how to say it, the price, anything to know" style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
              </>
            )}
            <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>Tap any text to change it. We only use what you told us. No made-up prices or claims.</div>
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button type="button" onClick={() => write()} disabled={writing} style={{ ...cta_, marginTop: 0, flex: '0 0 auto', width: 'auto', padding: '0 16px', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>{writing ? <Loader2 size={16} className="mvp-spin" /> : 'Again'}</button>
              <button type="button" onClick={next} disabled={writing || (!social.trim() && !gtext.trim())} style={{ ...cta_, marginTop: 0, flex: 1 }}>{inside ? 'Done' : 'Next'}</button>
            </div>
          </div>
        )}

        {step === 'plans' && kind && (
          <div style={hv(hue)}>
            {/* MORE DISHES (owner 2026-09-22, "add another dish on the next page"): the dishes so far, and a
               dashed row that opens the small sheet for one more. The words are written again after. */}
            {dishRows && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 18, background: '#fff', overflow: 'hidden' }}>
                  {[{ name: a.what ?? '', line: a.line ?? '', price: a.price ?? '' }, ...dishes].map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? `0.5px solid ${C.line}` : 0 }}>
                      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || 'A dish'}</b>{d.line.trim() && <small style={{ display: 'block', fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.line}</small>}</span>
                      {d.price.trim() && <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{/^\d/.test(d.price.trim()) ? `$${d.price.trim()}` : d.price.trim()}</span>}
                      {i > 0 && <button type="button" aria-label="Remove" onClick={() => { setDishes((x) => x.filter((_, j) => j !== i - 1)); void helpers.current?.write(true) }} style={{ width: 26, height: 26, borderRadius: 99, border: 0, background: '#f6f6f8', color: C.mute, display: 'grid', placeItems: 'center', cursor: 'pointer', marginRight: -6 }}><X size={12} /></button>}
                    </div>
                  ))}
                </div>
                {detail === 'dish' && (
                  <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 18, marginTop: 10, background: '#fff', overflow: 'hidden' }}>
                    {dishRow('Name', newDish.name, (v) => setNewDish((x) => ({ ...x, name: v })), 'Lemongrass chicken', true)}
                    {dishRow('Price', newDish.price, (v) => setNewDish((x) => ({ ...x, price: v })), '12', false, true)}
                    {dishRow('Description', newDish.line, (v) => setNewDish((x) => ({ ...x, line: v })), 'A line about it')}
                    <div style={{ display: 'flex', gap: 8, padding: '4px 14px 12px' }}>
                      <button type="button" disabled={!newDish.name.trim()} onClick={() => { setDishes((x) => [...x, newDish]); setNewDish({ name: '', line: '', price: '' }); setDetail(null); void helpers.current?.write(true) }} style={{ flex: 1, height: 40, borderRadius: 99, border: 0, background: C.ink, color: '#fff', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: newDish.name.trim() ? 1 : .5 }}>Add it</button>
                      <button type="button" onClick={() => { setNewDish({ name: '', line: '', price: '' }); setDetail(null) }} style={{ height: 40, padding: '0 14px', borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', font: 'inherit', fontSize: 14, fontWeight: 600, color: C.ink, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
                {dishes.length < 5 && detail !== 'dish' && <button type="button" onClick={() => setDetail('dish')} style={{ width: '100%', height: 46, marginTop: 10, borderRadius: 18, border: `1.5px dashed ${hexa(C.greenDk, 0.5)}`, background: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, color: C.greenDk, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Plus size={15} /> Another dish</button>}
              </div>
            )}
                {items.length ? <AnnounceMenu clientId={clientId} items={items} setItems={(f) => setItems((x) => f(x))} me={me} prices={prices} media={media.length} hasVideo={media.some((m) => m.video)} platformsWord={[...(google ? ['Google'] : []), ...platforms.map((p) => PLAT[p] ?? p)].join(', ') || 'Your channels'} bestHourWord={`${bestHour.h > 12 ? bestHour.h - 12 : bestHour.h} ${bestHour.h >= 12 ? 'pm' : 'am'}`} readyBy={readyBy || null} open={openItem} setOpen={setOpenItem} onGo={go} total={total} reach={reachEst} posting={posting} writing={writing} ready={ready} usualReach={usual?.median ?? null} simplePlans keep={keepLines} dates={{ posts: postDay, ready: onIt('graphic') ? (readyBy || null) : null, results: plusDays(postDay, 7) }} /> : <div style={{ padding: 30, textAlign: 'center', color: C.mute }}><Loader2 size={18} className="mvp-spin" /><div style={{ fontSize: 12.5, marginTop: 8 }}>Picking the usual for a {kind.label.toLowerCase()}</div></div>}
          </div>
        )}

        {step === 'plan' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>{simple ? 'What is inside' : 'Here is the plan'}</div>
            {simple && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: C.mute, marginTop: -4, marginBottom: 6 }}>Every line is set for you. Tap one to change it.</div>
                {([
                  ['picture', 'The picture', src === 'own' ? `Your ${media[0]?.video ? 'video' : 'photo'}${pieces.has('graphic') ? ', a designed graphic from it' : ''}` : src === 'newshoot' ? `A shoot day, about ${TIERS.find((t) => t.id === tier)?.photos ?? 15} photos, ${Array.from(pieces).filter((p) => p !== 'photos').map((p) => p === 'reel' ? 'a Reel' : 'a graphic').join(' and ') || 'the photos'}` : src === 'team' ? 'A designed graphic from our own photos' : src === 'shoot' ? 'The booked shoot' : 'Words only'],
                  ['where', 'Where and when', `${[...(google ? ['Google'] : []), ...platforms.map((p) => PLAT[p] ?? p)].join(', ') || 'Nowhere yet'}${story && hasIgFb ? ', a Story' : ''}. ${postNow ? 'As soon as it is ready' : niceDate(postDay)}${boost ? `. Boost $${Math.round(boostCents / 100)}` : ''}${also.size ? `. ${Array.from(also).map((k) => ALSO[k].label).join(', ')}` : ''}`],
                  ['words', 'The words', writing ? 'Writing them now' : social.trim() ? social.trim().slice(0, 110) + (social.trim().length > 110 ? '…' : '') : 'Not written yet. Tap to write'],
                ] as [Step, string, string][]).map(([st, l, d]) => <button key={st} type="button" onClick={() => setStep(st)} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '10px 0', borderTop: `0.5px solid ${C.line}`, borderBottom: 0, borderLeft: 0, borderRight: 0, background: 'none', font: 'inherit', color: C.ink, cursor: 'pointer' }}><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14 }}>{l}</b><small style={sub}>{d}</small></span><span style={{ fontSize: 12.5, fontWeight: 700, color: C.mute, flex: 'none' }}>Change</span></button>)}
                <div style={{ ...h3, marginTop: 14 }}>The plan</div>
              </div>
            )}
            <div>{preview.map((l) => <Line key={l.key} l={l} />)}</div>
            {previewTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>Total</span><span>{dollars(previewTotal)}</span></div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={() => (simple ? go() : commit())} disabled={posting} style={{ ...cta_, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Making it happen' : 'Make it happen'}</button>
            <button type="button" onClick={back} style={{ ...cta_, marginTop: 8, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>{simple ? 'Back' : 'Change something'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>Everything lands in Coming up. Nothing that costs money starts without your okay.</div>
          </div>
        )}

        {step === 'done' && result && (
          <div style={hv(hue)}>
            <div style={{ padding: '14px 4px 6px', textAlign: 'center' }}>
              <span style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: 99, background: C.greenSoft, color: C.greenDk, alignItems: 'center', justifyContent: 'center' }}><Check size={26} strokeWidth={2.5} /></span>
              <div style={{ ...h2, marginTop: 12 }}>{result.errors.length ? 'Most of it is in motion' : 'It is in motion'}</div>
            </div>
            <div>{result.plan.filter((l) => !/^w\d/.test(l.key)).map((l) => <Line key={l.key} l={l} />)}{(() => { const wk = result.plan.filter((l) => /^w\d/.test(l.key)); return wk.length ? <Line l={{ key: 'weekly', label: 'Every week from then on', detail: `${wk.length} more posts over the next 4 weeks. Cancel any in Coming up`, date: wk[0].date, cost: null, status: 'scheduled', ref: null }} /> : null })()}</div>
            {result.total > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>Total</span><span>{dollars(result.total)}</span></div>}
            {result.errors.map((e, i) => <div key={i} style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10, lineHeight: 1.45 }}>{e}</div>)}
            {also.has('team') && card.trim() && (
              <button type="button" onClick={() => { navigator.clipboard?.writeText(card).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }} style={{ ...cta_, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}><Copy size={15} /> {copied ? 'Copied' : 'Copy the team card'}</button>
            )}
            <button type="button" onClick={onClose} style={cta_}>Done</button>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 10 }}>It is on Coming up.</div>
          </div>
        )}
        </div>
        </>
  )
  if (page) return (
    <div className="cr" style={{ padding: '4px 16px 40px', color: C.ink, maxWidth: 480, margin: '0 auto' }}>
      <style>{DRAW_CSS}</style>
      {body}
    </div>
  )
  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Announce something" onClick={step === 'kind' ? onClose : undefined} style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} onFocusCapture={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250) }} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, fontFamily: 'inherit' }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step !== 'kind' && step !== 'done' && !(initialKind && visible.indexOf(step) === 0) ? <button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}
