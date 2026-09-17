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
import { ArrowLeft, Check, Loader2, X, Plus, Copy } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { Drawing, type Scene } from './drawings'
import { BrandOrMark } from '../mvp-insights'

export type AnnounceKind = 'dish' | 'hours' | 'deal' | 'event' | 'hiring' | 'open' | 'holiday' | 'else' | 'slow'
type Mode = 'own' | 'graphic' | 'video' | 'shoot' | 'nextshoot' | 'words'
type Also = 'gmenu' | 'sitemenu' | 'ordering' | 'apps' | 'email' | 'print' | 'team' | 'ghours' | 'fbevent' | 'sitepage' | 'creators' | 'gattr' | 'banner' | 'pos'
type Cta = 'order' | 'visit' | 'reserve' | 'message'
type Step = 'kind' | 'ekind' | 'night' | 'goal' | 'play' | 'facts' | 'picture' | 'where' | 'words' | 'plan' | 'done'
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
  { id: 'dish', label: 'New dish', scene: 'dish', hue: '#2e9a78', photo: true, picture: true, tags: true, limited: true, cta: 'order', also: ['gmenu', 'sitemenu', 'ordering', 'apps', 'email', 'print', 'team'], fields: [
    { key: 'what', label: 'What is it called?', hint: 'Pork belly bánh mì' },
    { key: 'line', label: 'One line about it', hint: 'Slow-roasted, on a house baguette', optional: true },
    { key: 'price', label: 'Price', hint: '$14', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
  ] },
  { id: 'hours', label: 'Hours changed', scene: 'hours', hue: '#3d8ed8', photo: true, cta: 'visit', hours: 'oneday', also: ['ghours', 'print', 'email', 'team'],
    alsoLabels: { print: { label: 'Door sign', detail: 'The new hours, printed or a file' }, email: { detail: 'Only worth it for a big change' } }, fields: [
    { key: 'what', label: 'What is changing?', hint: 'Open till 10 on Fridays, or closed for a week' },
    { key: 'line', label: 'Anything else?', hint: 'Back to normal on the 30th', optional: true },
    { key: 'from', label: 'From when', kind: 'date' },
    { key: 'until', label: 'Until when', kind: 'date', optional: true, hint: 'Leave it empty if this is for good' },
  ] },
  { id: 'deal', label: 'A deal', scene: 'offer', hue: '#dd9a1c', photo: true, picture: true, cta: 'visit', also: ['email', 'print', 'gattr', 'banner', 'pos', 'team'], reminder: 'A reminder the morning it starts',
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
  { id: 'event', label: 'An event', scene: 'event', hue: '#2e73b6', photo: true, picture: true, cta: 'visit', also: ['fbevent', 'sitepage', 'email', 'print', 'creators', 'team'], reminder: 'Two days before',
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
  { id: 'open', label: 'Now open', scene: 'open', hue: '#2e9a78', photo: true, picture: true, cta: 'visit', also: ['ghours', 'email', 'print', 'team'], reminder: 'A countdown post three days before',
    alsoLabels: { ghours: { label: 'Google says open', detail: 'Google, the website, the delivery apps' }, print: { label: 'Banner', detail: 'For the front, printed or a file' } }, fields: [
    { key: 'what', label: 'What is the news?', hint: 'Grand opening, back open, a new location, now on DoorDash' },
    { key: 'from', label: 'From when', kind: 'date' },
    { key: 'line', label: 'One line about it', hint: 'Same menu, twice the seats', optional: true },
    { key: 'offer', label: 'An opening offer', hint: 'First 50 guests get a free drink', optional: true },
    { key: 'address', label: 'The address, if it is new', hint: '412 Main St', optional: true },
  ] },
  { id: 'holiday', label: 'Holiday', scene: 'holiday', hue: '#dd9a1c', photo: true, picture: true, cta: 'reserve', hours: 'always', also: ['ghours', 'email', 'print', 'team'], reminder: 'A reminder before the day, or the pre-order deadline',
    alsoLabels: { ghours: { label: 'Holiday hours everywhere', detail: 'Google, the website, the delivery apps' }, print: { label: 'Menu insert', detail: 'The holiday menu or the hours, printed or a file' } }, fields: [
    { key: 'what', label: 'Which holiday?', hint: 'Thanksgiving' },
    { key: 'date', label: 'Which day?', kind: 'date' },
    { key: 'doing', label: 'What are you doing?', kind: 'long', hint: 'Pre-orders for pies, a special menu, open till 2 on the day' },
    { key: 'deadline', label: 'Pre-orders by', kind: 'date', optional: true },
  ] },
  { id: 'else', label: 'Something else', scene: 'else', hue: '#6e6e73', photo: true, picture: true, cta: 'visit', also: ['email', 'team'], fields: [
    { key: 'what', label: 'What is the news?', kind: 'long', hint: 'We hit 100 reviews. Thank you.' },
    { key: 'from', label: 'A date, if there is one', kind: 'date', optional: true },
  ] },
  /* the slow night: a front door, not a flow (owner 2026-09-17: "what would it do"). Two screens,
     which night and which play, then it hands into the Deal or the Event flow with every week on. */
  { id: 'slow', label: 'Slow night', scene: 'offer', hue: '#3b6fd4', hidden: true, cta: 'visit', also: [], fields: [] },
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
interface Ctx { name: string; pro: boolean; website: string | null; orderUrl: string | null; reserveUrl: string | null; guests: number; nextShoot: { id: string; date: string; who: string | null } | null; prices: { graphic: number | null; video: number | null; shoot: number | null }; weekdays?: { d: number; avgCents: number }[] | null; avgTicketCents?: number | null }
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

export default function AnnounceSheet({ clientId, onClose, hasGoogle = true, initialKind }: { clientId: string; onClose: () => void; /** whether the client has a Google listing to post to */ hasGoogle?: boolean; /** open straight on one kind: the Slow night tile */ initialKind?: AnnounceKind }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  /* The page behind must not move while the sheet is up (owner 2026-09-17: "you can move the form
     around"): the body is pinned at its scroll position and put back on close. */
  useEffect(() => {
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

  const [step, setStep] = useState<Step>('kind')
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
  const [mode, setMode] = useState<Mode>('words')
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
    setKind(k); setCta(k.cta); setTags(new Set()); setLimited(false); setOneDay(false); setClosed(k.id === 'holiday'); setReminder(!!k.reminder); setReminderText('')
    const dateKey = k.fields.find((f) => f.kind === 'date')?.key
    setA(dateKey ? { [dateKey]: todayIso() } : {})
    setAlso(new Set(k.also.filter((x) => ALSO[x].on(ctx))))
    setEkind(null); setWeekly(false); setGetin('show'); setLink(''); setPrice(''); setWhere('here'); setAddress(''); setTonight(true); setAfter(true); setTonightText(''); setAfterText(''); setGoal(25); setPostByTouched(false); setSocialEs(''); setFromSlow(false); setTables(10)
    if (k.id === 'slow') { setNight(slowestDay(ctx) ?? 2); setPart('dinner') }
    setStep(k.id === 'event' ? 'ekind' : k.id === 'slow' ? 'night' : 'facts')
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
      setA({ what: '', when: `${DAYS[night]}s, ${p.runs}`, from, until: plusDays(from, 21), code: DAYS[night].toUpperCase(), line: slowWords.trim() ? '' : '' })
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
  const platforms = useMemo(() => Array.from(new Set((targets ?? []).filter((t) => chosen.has(t.accountId)).map((t) => t.platform))), [targets, chosen])
  const igChosen = platforms.includes('instagram')
  const hasIgFb = (targets ?? []).some((t) => (t.platform === 'instagram' || t.platform === 'facebook') && chosen.has(t.accountId))
  const madeLater = mode === 'graphic' || mode === 'video' || mode === 'shoot' || mode === 'nextshoot'
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
  const minReady = (m: Mode) => plusDays(todayIso(), m === 'graphic' ? 2 : m === 'video' ? 4 : 7)
  const choose = (m: Mode) => {
    setMode(m)
    if (m === 'graphic' || m === 'video' || m === 'shoot') setReadyBy(maxIso(minReady(m), timing === 'by' ? plusDays(postBy, -2) : minReady(m)))
    else setReadyBy('')
  }
  useEffect(() => { if (timing === 'by' && (mode === 'graphic' || mode === 'video' || mode === 'shoot') && readyBy > plusDays(postBy, -1)) setReadyBy(maxIso(minReady(mode), plusDays(postBy, -2))) }, [postBy]) // eslint-disable-line react-hooks/exhaustive-deps
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
    setAlso((prev) => { const n = new Set(prev); if (g >= 50) n.add('creators'); else n.delete('creators'); if (ctx && ctx.guests > 0) n.add('email'); return n })
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
        if (mode === 'words') setMode('own')
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the photo') }
    setUploading(false)
  }

  const factsOut = (): Record<string, string> => {
    const facts: Record<string, string> = { ...a }
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
  const write = async () => {
    if (!kind) return
    setWriting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/announce-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: kind.id, answers: factsOut(), channels, cta: ctaEff, languages: spanish ? ['es'] : [], card: also.has('team'), reminderWhen: reminderWhen()?.phrase ?? '', tonight: (isEvent && tonight) || (isDeal && weekly), after: isEvent && after, ctaText: isEvent ? GETIN.find((x) => x.id === getin)?.cta : isDeal && a.code?.trim() ? `Say ${a.code.trim()} at the counter` : '' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not write it')
      setSocial(String(j.social ?? '')); setGtext(String(j.google ?? '')); setCard(String(j.card ?? '')); setReminderText(String(j.reminder ?? '')); setTonightText(String(j.tonight ?? '')); setAfterText(String(j.after ?? '')); setSocialEs(String(j.socialEs ?? ''))
      setStep('words')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not write it') }
    setWriting(false)
  }

  /* the plan as the owner will read it, before anything is made; the server sends back the real one */
  const preview = useMemo((): PlanLine[] => {
    if (!kind) return []
    const L: PlanLine[] = []
    const line = (key: string, label: string, detail: string, date: string | null, cost: number | null = null, status: PlanLine['status'] = 'with_team', why?: string) => L.push({ key, label, detail, date, cost, status, ref: null, why })
    const lead = leadDefault()
    const today = todayIso()
    if (mode === 'graphic') { line('graphic', 'We start the graphic', media.length ? `From your ${media.length === 1 ? 'photo' : `${media.length} photos`}${priceOn && a.price ? ', price on it' : ''}` : 'From our own photos', today, ctx?.prices.graphic ?? null, 'with_team', isEvent ? 'A night needs the date on the picture' : a.price ? 'A price on the picture is what people remember' : undefined); line('approve', 'You approve it', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'video') { line('video', 'The video', 'Pay to start. Then the team takes it', readyBy, ctx?.prices.video ?? null, 'needs_payment'); line('approve', 'You approve it', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'shoot') { line('shoot', 'The shoot', 'Pay to book. Then we pick the day', readyBy, ctx?.prices.shoot ?? null, 'needs_payment'); line('approve', 'You pick the shot', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'nextshoot' && ctx?.nextShoot) { line('nextshoot', 'Added to your shoot', `${ctx.nextShoot.who ? `With ${ctx.nextShoot.who}, ` : ''}we shoot it that day`, ctx.nextShoot.date); line('approve', 'You pick the shot', 'One tap in Coming up', ctx.nextShoot.date, null, 'later') }
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
  }, [kind, mode, media, priceOn, a, ctx, readyBy, postAt, platforms, igChosen, madeLater, postNow, bests, story, hasIgFb, again, postDay, google, also, boost, boostCents, goal, spanish, socialEs, reminder, reminderText, oneDay, closed, openAt, closeAt, ekind, weekly, getin, link, price, where, address, tonight, after, tonightText, afterText, timing, postByTouched, night, part, slowWords, tables, fromSlow]) // eslint-disable-line react-hooks/exhaustive-deps
  const previewTotal = preview.reduce((s, l) => s + (l.cost ?? 0), 0)

  const commit = async () => {
    if (posting || !kind) return
    setPosting(true); setErr(null)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    try {
      const r = await fetch('/api/dashboard/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        clientId, kind: kind.id, answers: factsOut(),
        picture: { mode, mediaUrls: media.map((m) => m.url), priceOn, brandKit, readyBy: readyBy || undefined, nextShootId: ctx?.nextShoot?.id },
        places: { accountIds: [...chosen], google, story: story && hasIgFb, also: [...also] },
        timing: { at: postNow ? null : postAt?.toISOString() ?? null, timezone: tz, again, boost, boostCents, reminders: extras() },
        whys: Object.fromEntries(preview.filter((l) => l.why).map((l) => [l.key, l.why])),
        words: { social: social.trim(), google: gtext.trim(), cta: ctaEff, languages: spanish ? ['es'] : [], card: also.has('team') ? card.trim() : '' },
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
  const steps: Step[] = ['facts', 'picture', 'where', 'words', 'plan']
  const visible: Step[] = isSlow ? ['night', 'play'] : [...(isEvent ? ['ekind' as Step] : []), ...steps.filter((s) => s !== 'picture' || kind?.picture)]
  const back = () => { const i = visible.indexOf(step); setStep(i <= 0 ? 'kind' : visible[i - 1]) }
  const next = () => { const i = visible.indexOf(step); setStep(visible[i + 1]) }
  const title = step === 'kind' ? 'Announce something' : step === 'done' ? 'Done' : step === 'ekind' ? 'An event' : isSlow ? 'Slow night' : fromSlow && step === 'facts' ? `${DAYS[night]} ${(PARTS.find((p) => p.id === part)?.label ?? 'dinner').toLowerCase()}` : (isEvent && a.what?.trim()) || kind?.label || ''
  const Line = ({ l }: { l: PlanLine }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.why && <small style={{ ...sub, color: C.greenDk, fontWeight: 600 }}>{l.why}</small>}{l.ref?.href && l.status === 'needs_payment' && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Pay to start</a>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dollars(l.cost)}</b>}
    </div>
  )
  const madeKind = mode === 'graphic' || mode === 'video' || mode === 'shoot'

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Announce something" onClick={step === 'kind' ? onClose : undefined} style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} onFocusCapture={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250) }} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, fontFamily: 'inherit' }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step !== 'kind' && step !== 'done' && !(isSlow && step === 'night' && initialKind) ? <button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        {step !== 'kind' && step !== 'done' && <div style={{ display: 'flex', gap: 4, margin: '0 0 14px' }}>{visible.map((s) => <i key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: visible.indexOf(s) <= visible.indexOf(step) ? C.ink : C.line }} />)}</div>}
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />

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
            <div style={h2}>Tell us about it</div>
            {kind.photo && (
              <div style={{ margin: '4px 0 6px' }}>
                {media.length === 0 ? (
                  <button type="button" onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 118, borderRadius: 18, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'pointer', font: 'inherit', color: C.ink }}>
                    {uploading ? <Loader2 size={22} className="mvp-spin" color={hue} /> : <><span style={{ width: 64 }}><Drawing spec={{ scene: 'photos' }} name="" rating="" t={(s) => s} /></span><span style={{ textAlign: 'left' }}><b style={{ fontSize: 14 }}>Add a photo or video</b><small style={sub}>Optional. We can make one next.</small></span></>}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                    {media.map((m, i) => <div key={i} style={{ position: 'relative', flex: 'none', width: 96, height: 96, borderRadius: 14, overflow: 'hidden', background: m.video ? C.ink : `center/cover url(${m.preview})` }}>{m.video && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>Video</span>}<button type="button" aria-label="Remove" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 99, border: 0, background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} /></button></div>)}
                    {media.length < 10 && <button type="button" onClick={() => fileRef.current?.click()} style={{ flex: 'none', width: 96, height: 96, borderRadius: 14, border: '1.5px dashed #c9c9d0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.mute }}>{uploading ? <Loader2 size={18} className="mvp-spin" /> : <Plus size={20} />}</button>}
                  </div>
                )}
              </div>
            )}
            {kind.fields.filter((f) => !(f.key === 'until' && kind.hours === 'oneday' && oneDay)).map((f) => (
              <label key={f.key} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
                {f.label}{f.optional && <span style={{ fontWeight: 500, color: C.faint, marginLeft: 4 }}>optional</span>}
                {f.kind === 'date' ? <input type="date" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={input} />
                  : f.kind === 'long' ? <textarea rows={3} value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={{ ...input, resize: 'none', lineHeight: 1.45 }} />
                  : <input type="text" value={a[f.key] ?? ''} onChange={(e) => setA((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.hint} style={input} />}
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
            {kind.limited && (
              <>
                <div style={{ ...rowS, marginTop: 8 }}><span>For a limited time</span><Switch on={limited} set={setLimited} /></div>
                {limited && <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Until when<input type="date" value={a.until ?? ''} onChange={(e) => setA((x) => ({ ...x, until: e.target.value }))} style={input} /></label>}
              </>
            )}
            {kind.tags && (
              <>
                <div style={h3}>Good to know</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TAGS.map((t) => <button key={t} type="button" onClick={() => setTags((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })} style={chip(tags.has(t))}>{t}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Only what you pick is ever said.</div>
              </>
            )}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={next} disabled={!ready} style={{ ...cta_, opacity: ready ? 1 : .5 }}>Next</button>
          </div>
        )}

        {step === 'picture' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>How should it look?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { m: 'own' as Mode, label: 'Use my photo', small: media.length ? `${media.length} added` : 'Add one a step back', scene: 'photos' as Scene, hue: '#2e9a78', off: media.length === 0 },
                { m: 'graphic' as Mode, label: 'Make a graphic', small: `${dollars(ctx?.prices.graphic ?? null) || 'Priced'} · 2 days`, scene: 'graphic' as Scene, hue: '#d99a1e', off: false },
                { m: 'video' as Mode, label: 'Make a video', small: `${dollars(ctx?.prices.video ?? null) || 'Priced'} · 4 days`, scene: 'reel' as Scene, hue: '#0f97a8', off: false },
                { m: 'shoot' as Mode, label: 'Book a shoot', small: `from ${dollars(ctx?.prices.shoot ?? null) || '$350'} · pick a day`, scene: 'creator' as Scene, hue: '#6a39de', off: false },
                ...(ctx?.nextShoot ? [{ m: 'nextshoot' as Mode, label: 'Add to my next shoot', small: `${niceDate(ctx.nextShoot.date)}${ctx.nextShoot.who ? ` with ${ctx.nextShoot.who}` : ''}`, scene: 'calendar' as Scene, hue: '#3b6fd4', off: false }] : []),
                { m: 'words' as Mode, label: 'Words only', small: 'Google and Facebook', scene: 'google' as Scene, hue: '#8a928e', off: false },
              ]).map((o) => (
                <button key={o.m} type="button" disabled={o.off} onClick={() => choose(o.m)} style={{ ...hv(o.hue), border: `1.5px solid ${mode === o.m ? C.ink : C.line}`, boxShadow: mode === o.m ? `inset 0 0 0 1px ${C.ink}` : 'none', borderRadius: 18, padding: '12px 10px 10px', textAlign: 'center', background: '#fff', cursor: o.off ? 'default' : 'pointer', font: 'inherit', color: C.ink, opacity: o.off ? .45 : 1 }}>
                  <span style={{ display: 'block', width: 54, margin: '0 auto 6px' }}><Drawing spec={{ scene: o.scene }} name="" rating="" t={(s) => s} /></span>
                  <b style={{ display: 'block', fontSize: 13.5, lineHeight: 1.2 }}>{o.label}</b><small style={{ display: 'block', color: C.mute, fontSize: 11.5, marginTop: 3 }}>{o.small}</small>
                </button>
              ))}
            </div>
            {madeKind && (
              <>
                <div style={h3}>For the {mode === 'graphic' ? 'graphic' : mode === 'video' ? 'video' : 'shoot'}</div>
                <div style={rowS}><span>Send what you have<small style={sub}>{media.length ? `${media.length} added. Phone photos are fine` : 'Phone photos are fine'}</small></span><button type="button" onClick={() => fileRef.current?.click()} style={chip(false)}>{uploading ? <Loader2 size={12} className="mvp-spin" /> : <Plus size={12} />} Add</button></div>
                {mode === 'graphic' && a.price && <div style={rowS}><span>Put the price on it</span><Switch on={priceOn} set={setPriceOn} /></div>}
                {mode === 'graphic' && <div style={rowS}><span>Match my brand kit</span><Switch on={brandKit} set={setBrandKit} /></div>}
                <div style={rowS}><span>Ready by</span><input type="date" min={minReady(mode)} value={readyBy} onChange={(e) => setReadyBy(e.target.value)} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>
                {mode !== 'graphic' && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>{mode === 'video' ? 'The video' : 'The shoot'} is paid before it starts. The plan shows the price and a Pay link.</div>}
              </>
            )}
            {mode === 'words' && igChosen && <div style={{ fontSize: 12, color: '#8a5a0c', marginTop: 10 }}>Instagram needs a picture. Words only goes to Facebook and Google.</div>}
            {mode === 'own' && media[0]?.video && <div style={{ fontSize: 12, color: C.greenDk, fontWeight: 600, marginTop: 10 }}>A vertical video becomes a Reel on Instagram and Facebook.</div>}
            {mode === 'own' && !media.some((m) => m.video) && <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>Got ten seconds of video? It becomes a Reel, and Reels reach further than photos.</div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={next} disabled={madeKind && !readyBy} style={{ ...cta_, opacity: madeKind && !readyBy ? .5 : 1 }}>Next</button>
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
            <button type="button" onClick={write} disabled={writing || channels.length === 0 || (timing === 'at' && !postAt)} style={{ ...cta_, opacity: channels.length === 0 || (timing === 'at' && !postAt) ? .5 : 1 }}>{writing ? <Loader2 size={16} className="mvp-spin" /> : null} {writing ? 'Writing' : 'Write it for me'}</button>
          </div>
        )}

        {step === 'words' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>The words</div>
            {platforms.length > 0 && (
              <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
                {media[0] && !media[0].video ? <div style={{ height: 170, background: `center/cover url(${media[0].preview})` }} /> : <div style={{ height: 110, background: hexa(hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 80 }}><Drawing spec={{ scene: madeLater ? (mode === 'video' ? 'reel' : mode === 'graphic' ? 'graphic' : 'photos') : kind.scene }} name="" rating="" t={(s) => s} /></span></div>}
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
              <button type="button" onClick={write} disabled={writing} style={{ ...cta_, marginTop: 0, flex: '0 0 auto', width: 'auto', padding: '0 16px', background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>{writing ? <Loader2 size={16} className="mvp-spin" /> : 'Again'}</button>
              <button type="button" onClick={next} disabled={writing || (!social.trim() && !gtext.trim())} style={{ ...cta_, marginTop: 0, flex: 1 }}>Next</button>
            </div>
          </div>
        )}

        {step === 'plan' && kind && (
          <div style={hv(hue)}>
            <div style={h2}>Here is the plan</div>
            <div>{preview.map((l) => <Line key={l.key} l={l} />)}</div>
            {previewTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, padding: '12px 0 0' }}><span>Total</span><span>{dollars(previewTotal)}</span></div>}
            {err && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 10 }}>{err}</div>}
            <button type="button" onClick={commit} disabled={posting} style={{ ...cta_, opacity: posting ? .6 : 1 }}>{posting ? <Loader2 size={16} className="mvp-spin" /> : null} {posting ? 'Making it happen' : 'Make it happen'}</button>
            <button type="button" onClick={back} style={{ ...cta_, marginTop: 8, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>Change something</button>
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
    </div>,
    document.body,
  )
}
