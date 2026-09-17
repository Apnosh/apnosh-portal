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

export type AnnounceKind = 'dish' | 'hours' | 'deal' | 'event' | 'hiring' | 'open' | 'holiday' | 'else'
type Mode = 'own' | 'graphic' | 'video' | 'shoot' | 'nextshoot' | 'words'
type Also = 'gmenu' | 'sitemenu' | 'ordering' | 'apps' | 'email' | 'print' | 'team' | 'ghours'
type Cta = 'order' | 'visit' | 'reserve' | 'message'
type Step = 'kind' | 'facts' | 'picture' | 'where' | 'words' | 'plan' | 'done'

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
  { id: 'deal', label: 'A deal', scene: 'offer', hue: '#dd9a1c', photo: true, picture: true, cta: 'visit', also: ['email', 'print', 'team'], reminder: 'A reminder the morning it starts',
    alsoLabels: { print: { label: 'Flyer', detail: 'For the counter and the window' } }, fields: [
    { key: 'what', label: 'What is the deal?', hint: 'Half-price boba with any sando' },
    { key: 'when', label: 'When does it run?', hint: 'Tuesdays, 4 to 6' },
    { key: 'from', label: 'Starts', kind: 'date' },
    { key: 'until', label: 'Ends', kind: 'date', optional: true, hint: 'Google needs an end date. Thirty days if empty' },
    { key: 'code', label: 'A code, if there is one', hint: 'BOBA5', optional: true },
    { key: 'line', label: 'Any fine print?', hint: 'Dine in only', optional: true },
  ] },
  { id: 'event', label: 'An event', scene: 'event', hue: '#dd9a1c', photo: true, picture: true, cta: 'reserve', also: ['email', 'print', 'team'], reminder: 'A reminder two days before, and a Story the morning of',
    alsoLabels: { print: { label: 'Poster', detail: 'For the window and the wall' } }, fields: [
    { key: 'what', label: 'What is happening?', hint: 'Trivia night' },
    { key: 'when', label: 'What day?', kind: 'date' },
    { key: 'time', label: 'What time?', hint: '7 pm' },
    { key: 'line', label: 'One line about it', hint: 'Teams of four, winner eats free', optional: true },
    { key: 'tickets', label: 'Tickets or cost', hint: 'Free, or $10 at the door', optional: true },
    { key: 'rsvp', label: 'Where to RSVP or buy tickets', hint: 'https://', optional: true },
    { key: 'where', label: 'Where, if not here', hint: 'The patio, or the park across the street', optional: true },
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
]

const TAGS = ['Spicy', 'Vegan', 'Vegetarian', 'Gluten free', 'Nuts', 'Dairy free', 'Halal']
const ALSO: Record<Also, { label: string; scene: Scene; hue: string; detail: (ctx: Ctx | null) => string; on: (ctx: Ctx | null) => boolean }> = {
  gmenu: { label: 'Google menu', scene: 'google', hue: '#3b6fd4', detail: () => 'Name, photo and price', on: () => true },
  sitemenu: { label: 'Website menu', scene: 'sitemenu', hue: '#0f97a8', detail: (c) => c?.website ? c.website.replace(/^https?:\/\//, '') : 'If we run your site', on: (c) => !!c?.website },
  ordering: { label: 'Online ordering', scene: 'order', hue: '#34a76a', detail: (c) => c?.orderUrl ? 'So Order online works on day one' : 'No ordering link on file yet', on: (c) => !!c?.orderUrl },
  apps: { label: 'DoorDash and Uber Eats', scene: 'apps', hue: '#c92d32', detail: () => 'We add it to both', on: () => false },
  email: { label: 'Tell your regulars', scene: 'email', hue: '#2e9a78', detail: (c) => c && c.guests > 0 ? `${c.guests.toLocaleString()} people on your list` : 'No list yet. We start one', on: (c) => !!c && c.guests > 0 },
  print: { label: 'Table tent', scene: 'print', hue: '#d99a1e', detail: () => 'Printed, or a file to print', on: () => false },
  team: { label: 'Tell the team', scene: 'dm', hue: '#5b53d6', detail: () => 'One card: what it is, how to say it', on: () => true },
  ghours: { label: 'Hours everywhere', scene: 'hours', hue: '#3b6fd4', detail: () => 'Google, the website, the delivery apps', on: () => true },
}
const CTAS: { id: Cta; label: string }[] = [{ id: 'order', label: 'Order online' }, { id: 'visit', label: 'Come in' }, { id: 'reserve', label: 'Reserve' }, { id: 'message', label: 'Message us' }]
const PLAT: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }

interface Target { accountId: string; platform: string; name: string }
interface Best { iso: string; label: string; posts: number }
interface Ctx { name: string; pro: boolean; website: string | null; orderUrl: string | null; reserveUrl: string | null; guests: number; nextShoot: { id: string; date: string; who: string | null } | null; prices: { graphic: number | null; video: number | null; shoot: number | null } }
interface PlanLine { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null }

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

export default function AnnounceSheet({ clientId, onClose, hasGoogle = true }: { clientId: string; onClose: () => void; /** whether the client has a Google listing to post to */ hasGoogle?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
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
    setStep('facts')
  }
  const required = kind ? kind.fields.filter((f) => !f.optional) : []
  const ready = required.every((f) => (a[f.key] ?? '').trim())
  const platforms = useMemo(() => Array.from(new Set((targets ?? []).filter((t) => chosen.has(t.accountId)).map((t) => t.platform))), [targets, chosen])
  const igChosen = platforms.includes('instagram')
  const hasIgFb = (targets ?? []).some((t) => (t.platform === 'instagram' || t.platform === 'facebook') && chosen.has(t.accountId))
  const madeLater = mode === 'graphic' || mode === 'video' || mode === 'shoot' || mode === 'nextshoot'
  const channels = useMemo(() => [...(google ? ['google'] : []), ...platforms], [google, platforms])
  /* Order online only when there is a link to order from; otherwise the ask is to come in */
  const ctaEff: Cta = cta === 'order' && !ctx?.orderUrl ? 'visit' : cta

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
    if (kind?.id === 'event' && reminder && dd.when && story && hasIgFb && media.length) { const d = atHour(dd.when, 10); if (d.getTime() > Date.now()) out.push({ key: 'story-dayof', label: 'Story the morning of', detail: 'Where people scroll that day', at: d.toISOString(), text: reminderText.trim() || social.trim(), story: true }) }
    if (kind?.id === 'hiring' && again) { const d = new Date((postAt ?? new Date()).getTime() + 14 * 86400e3); out.push({ key: 'again2', label: 'Posted a third time', detail: 'Two weeks on, until it is filled', at: d.toISOString(), text: social.trim() }) }
    return out
  }
  const write = async () => {
    if (!kind) return
    setWriting(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/announce-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind: kind.id, answers: factsOut(), channels, cta: ctaEff, languages: spanish ? ['es'] : [], card: also.has('team'), reminderWhen: reminderWhen()?.phrase ?? '' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not write it')
      setSocial(String(j.social ?? '')); setGtext(String(j.google ?? '')); setCard(String(j.card ?? '')); setReminderText(String(j.reminder ?? ''))
      setStep('words')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not write it') }
    setWriting(false)
  }

  /* the plan as the owner will read it, before anything is made; the server sends back the real one */
  const preview = useMemo((): PlanLine[] => {
    if (!kind) return []
    const L: PlanLine[] = []
    const line = (key: string, label: string, detail: string, date: string | null, cost: number | null = null, status: PlanLine['status'] = 'with_team') => L.push({ key, label, detail, date, cost, status, ref: null })
    const today = todayIso()
    if (mode === 'graphic') { line('graphic', 'We start the graphic', media.length ? `From your ${media.length === 1 ? 'photo' : `${media.length} photos`}${priceOn && a.price ? ', price on it' : ''}` : 'From our own photos', today, ctx?.prices.graphic ?? null); line('approve', 'You approve it', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'video') { line('video', 'The video', 'Pay to start. Then the team takes it', readyBy, ctx?.prices.video ?? null, 'needs_payment'); line('approve', 'You approve it', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'shoot') { line('shoot', 'The shoot', 'Pay to book. Then we pick the day', readyBy, ctx?.prices.shoot ?? null, 'needs_payment'); line('approve', 'You pick the shot', 'One tap in Coming up', readyBy, null, 'later') }
    if (mode === 'nextshoot' && ctx?.nextShoot) { line('nextshoot', 'Added to your shoot', `${ctx.nextShoot.who ? `With ${ctx.nextShoot.who}, ` : ''}we shoot it that day`, ctx.nextShoot.date); line('approve', 'You pick the shot', 'One tap in Coming up', ctx.nextShoot.date, null, 'later') }
    const hour = postAt ? postAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'now'
    if (platforms.length) {
      const igNeeds = igChosen && media.length === 0 && !madeLater
      line('post', platforms.map((p) => PLAT[p] ?? p).join(', '), madeLater ? `Once you approve the picture, ${hour}` : igNeeds ? 'Instagram needs a photo. The team adds one, then posts' : postNow ? 'Right now' : `${hour}${bests.length ? ', your best hour' : ''}`, postDay, null, madeLater || igNeeds ? 'with_team' : postNow ? 'done' : 'scheduled')
      if (story && hasIgFb) line('story', 'Story goes up', madeLater ? 'Same day, once the picture is in' : 'An hour after the post', postDay, null, madeLater ? 'with_team' : 'scheduled')
      if (again) line('again', 'Posted again', kind.id === 'hiring' ? 'A week later, until it is filled' : 'A week later, for the ones who missed it', plusDays(postDay, 7), null, madeLater ? 'with_team' : 'scheduled')
    }
    if (google) line('google', 'Google', ctx?.pro && postNow && !madeLater ? 'Right now' : madeLater ? 'Once the picture is in' : ctx?.pro === false ? 'The team posts it for you' : 'The team posts it on the day', postDay, null, ctx?.pro && postNow && !madeLater ? 'done' : 'with_team')
    const menus = (['gmenu', 'sitemenu', 'apps'] as Also[]).filter((x) => also.has(x))
    if (menus.length) line('menus', menus.map((x) => ALSO[x].label).join(', '), `Name${media.length ? ', photo' : ''}${a.price ? `, ${a.price}` : ''}`, postDay)
    if (hoursOn && (a.from || a.date)) line('ghours-google', 'Google hours set', closed ? `Closed ${niceDate(a.date || a.from)}` : `${clock(openAt)} to ${clock(closeAt)} on ${niceDate(a.date || a.from)}`, todayIso(), null, 'done')
    if (also.has('ghours')) line('ghours', kind.alsoLabels?.ghours?.label ?? 'Hours updated everywhere', hoursOn ? 'The website and the delivery apps' : 'Google, the website, the delivery apps', a.from || a.date || postDay)
    if (platforms.length) for (const x of extras()) line(x.key, x.label, madeLater ? `${x.detail}. The team posts it` : x.detail, x.at.slice(0, 10), null, madeLater ? 'with_team' : 'scheduled')
    if (also.has('ordering')) line('ordering', 'Online ordering', 'Added so Order online works', postDay)
    if (also.has('email')) line('email', ctx && ctx.guests > 0 ? `Email to ${ctx.guests.toLocaleString()} regulars` : 'Email to your regulars', 'Written from the same words', plusDays(postDay, 1))
    if (also.has('print')) line('print', kind.alsoLabels?.print?.label ?? 'Table tent', 'The team quotes it, printed or a file', postDay)
    if (also.has('team')) line('team', 'Team card', 'To everyone on the portal, and one to copy', today, null, 'done')
    if (boost) line('boost', 'Boost it', 'Open Boost once it has posted', postDay, null, 'later')
    line('results', 'How it did', 'Views, saves and mentions, in Insights', plusDays(postDay, 7), null, 'later')
    return L
  }, [kind, mode, media, priceOn, a, ctx, readyBy, postAt, platforms, igChosen, madeLater, postNow, bests, story, hasIgFb, again, postDay, google, also, boost, reminder, reminderText, oneDay, closed, openAt, closeAt]) // eslint-disable-line react-hooks/exhaustive-deps
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
        timing: { at: postNow ? null : postAt?.toISOString() ?? null, timezone: tz, again, boost, reminders: extras() },
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
  const visible = steps.filter((s) => s !== 'picture' || kind?.picture)
  const back = () => { const i = visible.indexOf(step); setStep(i <= 0 ? 'kind' : visible[i - 1]) }
  const next = () => { const i = visible.indexOf(step); setStep(visible[i + 1]) }
  const title = step === 'kind' ? 'Announce something' : step === 'done' ? 'Done' : kind?.label ?? ''
  const Line = ({ l }: { l: PlanLine }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, alignItems: 'flex-start' }}>
      <span style={{ width: 62, flex: 'none', fontSize: 12, fontWeight: 700, color: C.mute, paddingTop: 2 }}>{l.date ? niceDate(l.date).replace(/^(\w+), /, '$1 ') : ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{l.label}</b><small style={sub}>{l.detail}</small>{l.ref?.href && l.status === 'needs_payment' && <a href={l.ref.href} style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: C.ink, textDecoration: 'underline' }}>Pay to start</a>}</span>
      {l.cost != null && l.cost > 0 && <b style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dollars(l.cost)}</b>}
    </div>
  )
  const madeKind = mode === 'graphic' || mode === 'video' || mode === 'shoot'

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Announce something" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink, fontFamily: 'inherit' }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          {step !== 'kind' && step !== 'done' ? <button type="button" onClick={back} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={16} /></button> : <span style={{ width: 34 }} />}
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        {step !== 'kind' && step !== 'done' && <div style={{ display: 'flex', gap: 4, margin: '0 0 14px' }}>{visible.map((s) => <i key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: visible.indexOf(s) <= visible.indexOf(step) ? C.ink : C.line }} />)}</div>}
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />

        {step === 'kind' && (
          <>
            <div style={h2}>What is the news?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => pick(k)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, ...hv(k.hue) }}>
                  <span style={{ width: '100%', aspectRatio: '1.25', borderRadius: 22, background: hexa(k.hue, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, boxSizing: 'border-box' }}><span style={{ width: '72%' }}><Drawing spec={{ scene: k.scene }} name="" rating="" t={(s) => s} /></span></span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{k.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>Pick one. A few questions, then we write it, make it and post it where you choose.</div>
          </>
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
            {kind.hours && (
              <>
                {kind.hours === 'oneday' && <div style={{ ...rowS, marginTop: 8 }}><span>Just that one day<small style={sub}>We set it on Google straight away</small></span><Switch on={oneDay} set={setOneDay} /></div>}
                {hoursOn && <div style={rowS}><span>Closed that day</span><Switch on={closed} set={setClosed} /></div>}
                {hoursOn && !closed && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Open<input type="time" value={openAt} onChange={(e) => setOpenAt(e.target.value)} style={input} /></label><label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Close<input type="time" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} style={input} /></label></div>}
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
            {timing === 'by' && <div style={{ ...rowS, marginTop: 6 }}><span>Post by<small style={sub}>{bests[0] ? `At ${bests[0].label.replace(/^\w+ at /, '')}, your best hour` : 'At 6 pm'}</small></span><input type="date" min={todayIso()} value={postBy} onChange={(e) => setPostBy(e.target.value)} style={{ ...input, width: 'auto', marginTop: 0, padding: '7px 10px', fontSize: 13 }} /></div>}
            {timing === 'at' && <input type="datetime-local" value={atLocal} onChange={(e) => setAtLocal(e.target.value)} style={input} />}
            {timing === 'ready' && madeLater && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>The day after you approve the picture, at your best hour.</div>}
            {kind.reminder && reminderWhen() && <div style={rowS}><span>Remind them<small style={sub}>{kind.reminder}</small></span><Switch on={reminder} set={setReminder} /></div>}
            {platforms.length > 0 && <div style={rowS}><span>{kind.id === 'hiring' ? 'Post again each week' : 'Post again in a week'}<small style={sub}>{kind.id === 'hiring' ? 'Until it is filled' : 'Most people miss the first one'}</small></span><Switch on={again} set={setAgain} /></div>}
            <div style={rowS}><span>Boost it<small style={sub}>Reach more people nearby, after it posts</small></span><Switch on={boost} set={setBoost} /></div>
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
            <div style={h3}>What should they do?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{CTAS.filter((c) => c.id !== 'order' || ctx?.orderUrl).map((c) => <button key={c.id} type="button" onClick={() => setCta(c.id)} style={chip(ctaEff === c.id)}>{c.label}</button>)}</div>
            <div style={h3}>Language</div>
            <div style={{ display: 'flex', gap: 6 }}><span style={chip(true, true)}>English</span><button type="button" onClick={() => setSpanish((s) => !s)} style={chip(spanish)}>{spanish ? '' : '+ '}Spanish</button></div>
            {reminderText && reminderWhen() && (
              <>
                <div style={h3}>{reminderWhen()!.label}, {reminderWhen()!.detail.toLowerCase()}</div>
                <textarea value={reminderText} onChange={(e) => setReminderText(e.target.value.slice(0, 2200))} rows={3} style={{ ...input, marginTop: 0, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }} />
              </>
            )}
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
            <div>{result.plan.map((l) => <Line key={l.key} l={l} />)}</div>
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
