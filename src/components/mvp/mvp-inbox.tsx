'use client'
import { markInboxSeen } from './use-inbox-unread'

/**
 * Owner Notifications — LinkedIn-style notification feed. The page lives at
 * /dashboard/inbox (route kept) but reads as "Notifications" to the owner: one
 * hub for everything they may need to see or act on.
 *
 * Visual model (per the owner's LinkedIn reference): a single row of filter
 * pills (active = filled), then a flat feed of rows — round avatar, rich text
 * with the entity in bold, a timestamp + "⋯" on the right, an optional gray
 * preview box, and an outlined action button (Reply / Review / Reconnect).
 * Under "All" the feed still leads with "Needs you" so urgent items surface
 * first. Wired to real data (/api/dashboard/inbox).
 */
import { useCallback, useEffect, useState } from 'react'
import { CARD_SHADOW, Segmented } from './kit'
import Link from 'next/link'
import { Bell, CalendarDays, Check, Clapperboard, CreditCard, FileText, Flag, Hourglass, Loader2, MoreHorizontal, Palette, PartyPopper, Plug, Rocket, Search, Star, ThumbsUp, TrendingUp } from 'lucide-react'
import { markInboxRead, markWinRead } from '@/app/dashboard/inbox/actions'
import { BrandOrMark } from './mvp-insights'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  coral: '#c0564f', coralSoft: '#fdeeee',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

type Chip = 'approvals' | 'reviews' | 'todos' | 'fix'
interface Review { reviewId: string; rating: number; author: string; source: string; text: string; suggestedReply: string; avatar?: string | null }
interface Item { id: string; kind: string; chip: Chip; band: 'today' | 'week'; icon: string; source?: string; title: string; subtitle: string; time: string; href: string; status?: string; unread: boolean; review?: Review }
interface Win { id: string; source?: string; icon: string; title: string; body: string; time: string; link: string | null; read: boolean }
interface InboxData { items: Item[]; wins: Win[]; counts: { needsYou: number; today: number } }

// Single LinkedIn-style pill row (active = filled).
/* Four, not six (owner 2026-09-11): Comments and Activity are gone from here. Comments live on
   each post's own sheet; the activity rows still show under All. */
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'needsyou', label: 'Needs you' },
  { key: 'reviews', label: 'Reviews' }, { key: 'messages', label: 'Messages' },
]
const COUNTED = new Set(['needsyou', 'reviews'])
// Which item chips each filter shows. "Needs you" folds in the old Fix-its
// (broken connections); "Activity" is the tasks/updates + wins stream.
const CHIPS: Record<string, Chip[]> = {
  needsyou: ['approvals', 'fix'],
  reviews: ['reviews'],
  activity: ['todos'],
}
// Old ?tab= deep-link values still resolve (home + suggestion cards use them).
const TAB_ALIAS: Record<string, string> = { approvals: 'needsyou', fix: 'needsyou', reviews: 'reviews', todos: 'all', activity: 'all', comments: 'all', all: 'all' }

export default function MvpInbox({ clientId }: { clientId: string }) {
  const [data, setData] = useState<InboxData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [items, setItems] = useState<Item[]>([])

  /* Warm the comments queue the moment the inbox opens. It is two round trips to
     the vendor and nobody is waiting on it yet, so it costs nothing here and
     saves the whole wait when the tab is tapped. */
  /* Opening this screen is what clears the bell's mint number (owner 2026-09-11), whether or not
     the owner scrolls to the last row. The red number is untouched: it clears only as each
     needs-you item is resolved. */
  useEffect(() => { markInboxSeen(clientId); inboxChanged() }, [clientId])

  useEffect(() => {
    let live = true
    fetch(`/api/dashboard/inbox?clientId=${clientId}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j: InboxData) => { if (live) { setData(j); setItems(j.items) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [clientId])

  // Deep link: Home's "Needs your approval" → ?tab=approvals (aliased to the
  // new filter keys, so old links keep working).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (!t) return
    const target = TAB_ALIAS[t] ?? (FILTERS.some((f) => f.key === t) ? t : null)
    if (target) setFilter(target)
  }, [])

  if (error) return <Shell><Centered>Couldn&apos;t load your notifications: {error}</Centered></Shell>
  if (!data) return <Shell><Centered><Loader2 size={16} className="animate-spin" /> Loading your notifications…</Centered></Shell>

  const needsYou = items.length
  const q = ''
  const countFor = (k: string) => k === 'all' ? items.length : items.filter((i) => CHIPS[k]?.includes(i.chip)).length

  // Dismiss an item via the "⋯" (mark read + drop from the feed).
  const onDismiss = (id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); void markInboxRead(id) }

  return (
    <Shell>
      {/* the top row is the header (owner 2026-09-04): no title, no count line — just the filter */}
      <div style={{ padding: '4px 16px 10px', flexShrink: 0 }}>
        <Segmented items={FILTERS.map((f) => [f.key, f.label] as [typeof f.key, string])} value={filter} onChange={setFilter} counts={Object.fromEntries(FILTERS.filter((f) => COUNTED.has(f.key)).map((f) => [f.key, countFor(f.key)]))} hot={['needsyou']} />
      </div>

      {/* Comments come from the social vendor rather than the inbox feed, so this
          filter swaps the list for its own pane instead of filtering Items. */}
      {filter === 'messages' ? <MessagesPane clientId={clientId} />
        : <ListView filter={filter} items={items} wins={data.wins} q={q} onDismiss={onDismiss} />}

      <style>{`@keyframes inrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.inrise{animation:inrise .26s ease both}.mvp-swipe-x{scrollbar-width:none}.mvp-swipe-x::-webkit-scrollbar{display:none}`}</style>
    </Shell>
  )
}

/**
 * COMMENTS ARRIVE INSTANTLY THE SECOND TIME, AND THE TAB IS WARM THE FIRST.
 * =========================================================================
 * Loading the queue is one vendor call for the posts that HAVE comments, then one
 * more per post -- eight in parallel. That is two round trips to a third party
 * before a single row can be drawn, and it was paid again on every single visit
 * to the tab, with "Loading comments…" in the middle of the screen each time.
 *
 * Three things fix it, none of which make the vendor faster:
 *   · the last answer is kept, in memory and in localStorage, and drawn at once
 *   · a fresh one is fetched behind it every time, so what you read is never old
 *     for longer than it takes to arrive
 *   · the request STARTS when the inbox opens, not when the tab is tapped, so by
 *     the time anyone reaches Comments it is usually already in hand
 *
 * One request per client at a time: tapping between tabs used to stack them up.
 */
/* The vendor's own words never reach an owner. With no key configured the
   comments endpoint answers "ZERNIO_API_KEY is not set", which is true and no
   help to a restaurant; anything shaped like an internal name becomes this. */
const COMMENTS_PLAIN = 'We could not reach your accounts just now. Try again in a minute.'
export const ownerSafe = (m: string): string =>
  (!m || /[A-Z]{3,}[_ ][A-Z]/.test(m) || /\bAPI\b|\bkey\b|\btoken\b/i.test(m) ? COMMENTS_PLAIN : m)

const COMMENT_KEY = (clientId: string) => `apnosh.comments.${clientId}`
const commentMem = new Map<string, CommentRow[]>()
const commentFlight = new Map<string, Promise<CommentRow[]>>()

export function cachedComments(clientId: string): CommentRow[] | null {
  const mem = commentMem.get(clientId)
  if (mem) return mem
  try {
    const raw = window.localStorage.getItem(COMMENT_KEY(clientId))
    if (!raw) return null
    const rows = JSON.parse(raw) as CommentRow[]
    if (!Array.isArray(rows)) return null
    commentMem.set(clientId, rows)
    return rows
  } catch { return null }
}

/** Always a real fetch; the caches above are for what to SHOW while it runs. */
export function loadComments(clientId: string): Promise<CommentRow[]> {
  const running = commentFlight.get(clientId)
  if (running) return running
  const p = (async () => {
    const r = await fetch(`/api/dashboard/social-comments?clientId=${clientId}`, { cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'Could not load comments')
    const rows = (j.comments ?? []) as CommentRow[]
    commentMem.set(clientId, rows)
    try { window.localStorage.setItem(COMMENT_KEY(clientId), JSON.stringify(rows)) } catch { /* private mode */ }
    return rows
  })().finally(() => { commentFlight.delete(clientId) })
  commentFlight.set(clientId, p)
  return p
}

export interface CommentRow { id: string; platform: string; postId: string | null; accountId?: string | null; authorName: string; text: string; createdAt: string | null; replied: boolean; canReply?: boolean; url?: string | null; postPermalink?: string | null; postCaption?: string | null; likes?: number }

/**
 * COMMENTS ON THEIR POSTS, with the reply in the same place.
 * ==========================================================
 * Several owners in testing said their customers talk to them in comments rather
 * than reviews, and one has no website at all, so Instagram IS her storefront.
 * None of it reached the product until now.
 *
 * Unanswered first, because this is a queue to work rather than a feed to read.
 * An error says so out loud: an empty list would read as "nobody commented",
 * which is a different and much worse claim than "we could not load them".
 */
interface Convo { id: string; accountId: string; platform: string; who: string; lastMessage: string; updatedAt: string | null; unread: number; url?: string | null }
interface Msg { id: string; message: string; senderName: string | null; direction: 'in' | 'out'; createdAt: string | null; deleted: boolean }

/**
 * DIRECT MESSAGES.
 * Several owners said their customers reach them here rather than through
 * reviews, and one has no website at all, so her Instagram inbox is her shop.
 *
 * Two views in one pane: the threads, then one thread. Unread first, because an
 * inbox is a queue and somebody waiting outranks somebody already answered.
 */
function MessagesPane({ clientId }: { clientId: string }) {
  const [convos, setConvos] = useState<Convo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<Convo | null>(null)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let live = true
    setErr(null)
    fetch(`/api/dashboard/social-messages?clientId=${clientId}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || 'Could not load messages'); return j }))
      .then((j) => { if (live) setConvos((j.conversations ?? []) as Convo[]) })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : 'Could not load messages'); setConvos([]) } })
    return () => { live = false }
  }, [clientId])

  const openThread = useCallback(async (c: Convo) => {
    setOpen(c); setMsgs(null); setDraft(''); setErr(null)
    try {
      const r = await fetch(`/api/dashboard/social-messages?clientId=${clientId}&conversationId=${encodeURIComponent(c.id)}&accountId=${encodeURIComponent(c.accountId)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load this thread')
      setMsgs((j.messages ?? []) as Msg[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load this thread'); setMsgs([])
    }
  }, [clientId])

  async function send() {
    const text = draft.trim()
    if (!text || !open || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/dashboard/social-messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, conversationId: open.id, accountId: open.accountId, text }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send')
      /* Shown immediately rather than refetched. The platform can take a moment
         to echo it back, and a message that vanishes reads as a failed send. */
      setMsgs((cur) => [...(cur ?? []), { id: `local-${Date.now()}`, message: text, senderName: null, direction: 'out', createdAt: new Date().toISOString(), deleted: false }])
      setDraft('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send')
    } finally { setSending(false) }
  }

  if (open) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderBottom: `1px solid ${C.line}` }}>
          <button type="button" onClick={() => { setOpen(null); setMsgs(null); setErr(null) }} style={{ font: 'inherit', fontSize: 13, color: C.greenDk, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Back</button>
          <BrandOrMark provider={open.platform} size={17} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.who}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs === null ? <div style={{ fontSize: 13, color: C.faint }}>Loading…</div>
            : msgs.length === 0 ? <div style={{ fontSize: 13, color: C.faint }}>Nothing in this thread yet.</div>
            : msgs.map((m) => (
              <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.45, padding: '8px 11px', borderRadius: 14, background: m.direction === 'out' ? C.greenSoft : '#fff', border: `0.5px solid ${C.line}`, color: m.deleted ? C.faint : C.ink, fontStyle: m.deleted ? 'italic' : 'normal', wordBreak: 'break-word' }}>
                  {m.deleted ? 'This message was deleted' : m.message}
                </div>
              </div>
            ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, padding: '10px 14px' }}>
          {err && <div style={{ fontSize: 12, color: C.coral, marginBottom: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={1500} placeholder="Write a reply…"
              style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: 9, fontSize: 13.5, fontFamily: 'inherit', color: C.ink, resize: 'none' }} />
            <button type="button" disabled={!draft.trim() || sending} onClick={() => void send()}
              style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 15px', borderRadius: 99, border: 'none', cursor: draft.trim() && !sending ? 'pointer' : 'default', background: draft.trim() && !sending ? C.ink : C.line, color: draft.trim() && !sending ? '#fff' : C.faint }}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>Sent privately, as your business.</div>
        </div>
      </div>
    )
  }

  if (convos === null) return <Centered>Loading messages…</Centered>
  if (err && convos.length === 0) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center', color: C.mute, fontSize: 13.5, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, color: C.ink, marginBottom: 4 }}>Messages did not load</div>{err}
      </div>
    )
  }
  if (convos.length === 0) return <InboxEmpty icon={Check} title="No messages yet" sub="When someone messages you on a connected account, the conversation lands here." />

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {convos.map((c) => (
        <button key={c.id} type="button" onClick={() => void openThread(c)} className="mvp-row"
          style={{ width: '100%', display: 'flex', gap: 11, alignItems: 'flex-start', padding: '12px 14px', background: c.unread > 0 ? C.greenSoft : 'transparent', border: 'none', borderBottom: `1px solid ${C.line}`, textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
          <span style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={c.platform} size={22} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.who}</span>
              {c.unread > 0 && <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: '#fff', background: C.greenDk, borderRadius: 99, padding: '1px 7px' }}>{c.unread}</span>}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 2, ...clampStyle(1) }}>{c.lastMessage || 'No messages yet'}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</div>
}
/** The cold start, in the shape of what is coming: four comment rows, greyed.
 *  A centred spinner on an empty screen makes a two-second wait feel like a
 *  broken tab; blocks in the right places make it feel like a list arriving. */
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 24, textAlign: 'center' }}>{children}</div>
}
function GlyphBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', border: `1px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff', color: active ? C.greenDk : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}
function InboxEmpty({ icon: Icon, title, sub }: { icon: typeof Check; title: string; sub: string }) {
  return (
    <div className="inrise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 44px 24px' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon size={25} color={C.green} /></div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}
/* ── A single notification row: avatar · body · time/⋯. Full-width and
 *  uniform across every type (review, approval, fix, win), separated by a
 *  hairline like a real notifications feed. Renders as a Link when it has a
 *  destination; long bodies clamp to two lines with a trailing "…". */
function NotifRow({ href, unread, time, onDismiss, onNav, avatar, children }: { href?: string; unread?: boolean; time?: string; onDismiss?: () => void; onNav?: () => void; avatar: React.ReactNode; children: React.ReactNode }) {
  // Unread = a faint mint fill with a soft inner glow across the whole row, plus the dot and a
  // green timestamp (owner 2026-09-11). Opened rows sit plain.
  const frame: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: '12px 14px',
    background: unread ? 'rgba(74,189,152,.08)' : 'transparent',
    boxShadow: unread ? 'inset 0 0 0 1px rgba(74,189,152,.14), inset 0 0 28px rgba(74,189,152,.08)' : 'none',
    borderRadius: 16, margin: '0 8px 4px',
  }
  const inner = (
    <>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingTop: 1, minWidth: 26 }}>
        {(time || unread) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {unread && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green, flexShrink: 0 }} />}
            {time && <span style={{ fontSize: 11.5, fontWeight: unread ? 700 : 400, color: unread ? C.greenDk : C.faint, whiteSpace: 'nowrap' }}>{time}</span>}
          </div>
        )}
        {onDismiss && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss() }} aria-label="Dismiss" style={{ width: 26, height: 22, border: 'none', background: 'none', color: C.faint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: 0 }}><MoreHorizontal size={18} /></button>
        )}
      </div>
    </>
  )
  return href
    ? <Link href={href} onClick={onNav} className="inrise" style={{ ...frame, textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
    : <div className="inrise" style={frame}>{inner}</div>
}

/* the feed still sends an emoji per kind; here each one becomes a real icon in a soft tile
   (owner 2026-09-04: "real icons, our aesthetic") */
const EMOJI_ICON: Record<string, React.ReactNode> = {
  '🎨': <Palette size={20} />, '📝': <FileText size={20} />, '🚀': <Rocket size={20} />, '⭐': <Star size={20} />, '🔌': <Plug size={20} />, '✅': <Check size={20} />, '🎉': <PartyPopper size={20} />,
  '🎬': <Clapperboard size={20} />, '👍': <ThumbsUp size={20} />, '💳': <CreditCard size={20} />, '🗓️': <CalendarDays size={20} />, '📈': <TrendingUp size={20} />, '🔍': <Search size={20} />, '⏳': <Hourglass size={20} />, '🏁': <Flag size={20} />,
}
/* Apnosh's own mark — the same mint→gold ring the business avatar wears, with an A — for
   everything Apnosh itself did (built a plan, delivered a piece, sent a recap) */
function ApnoshMark({ size = 44 }: { size?: number }) {
  return (
    <span style={{ display: 'block', width: size, height: size, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #4abd98 0%, #8ee5c6 45%, #ffd58a 100%)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.08)', boxSizing: 'border-box', flexShrink: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: '#fff', fontSize: size * 0.4, fontWeight: 800, letterSpacing: '-.02em', color: C.greenDk, fontFamily: DISPLAY }}>A</span>
    </span>
  )
}
/* Platforms the brand mark can draw. Anything else is Apnosh's own work. */
const BRAND_SOURCES = new Set(['google', 'google_business_profile', 'gbp', 'google_analytics', 'google_search_console', 'instagram', 'facebook', 'tiktok', 'youtube', 'yelp', 'linkedin'])
/* The avatar says WHAT the row is about before a word is read (owner 2026-09-04: "Google
 * shows the Google symbol, TikTok TikTok"). A row about a platform wears that platform's
 * mark in a white circle; a broken connection gets a coral ring around it. A row about
 * something Apnosh made wears the kind's glyph in a soft mint tile, never the logo, so ten
 * rows never look like ten copies of the same thing. */
function IconAvatar({ emoji, source, danger }: { emoji: string; source?: string; danger?: boolean }) {
  if (source && BRAND_SOURCES.has(source)) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: '50%', boxShadow: danger ? `0 0 0 2px ${C.coral}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <BrandOrMark provider={source} size={26} />
        {danger && <span aria-hidden style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: '50%', background: C.coral, border: '2px solid #fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plug size={10} /></span>}
      </div>
    )
  }
  if (danger || emoji === '🔌') return <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.coralSoft, color: C.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Plug size={19} /></div>
  const glyph = EMOJI_ICON[emoji]
  if (glyph) return <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{glyph}</div>
  return <ApnoshMark />
}
/* Tell the top row's bell that the count moved. */
const inboxChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('apnosh:inbox-changed')) }
const clampStyle = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

function Lead({ bold, rest, lines = 3 }: { bold: string; rest?: string; lines?: number }) {
  // Body clamps to three lines (owner 2026-09-11); the trailing "…" signals there's more and the
  // whole row taps through to the full text.
  return (
    <div style={{ fontSize: 14, lineHeight: 1.4, color: C.ink, ...clampStyle(lines) }}>
      <b style={{ fontWeight: 700 }}>{bold}</b>{rest ? <span style={{ color: C.mute, fontWeight: 400 }}>{' '}{rest}</span> : null}
    </div>
  )
}

const matchItem = (i: Item, q: string) => !q || `${i.title} ${i.subtitle} ${i.review?.text ?? ''}`.toLowerCase().includes(q)

/* ── Feed for the selected filter. "All" is one flat feed (urgent items first,
 *  then everything else, then the quiet wins) — no section headers. A single
 *  category is a flat list too. */
function ListView({ filter, items, wins, q, onDismiss }: { filter: string; items: Item[]; wins: Win[]; q: string; onDismiss: (id: string) => void }) {
  const list = (filter === 'all' ? items : items.filter((i) => (CHIPS[filter] ?? []).includes(i.chip))).filter((i) => matchItem(i, q))
  const wq = q ? wins.filter((w) => `${w.title} ${w.body}`.toLowerCase().includes(q)) : wins
  const winList = (filter === 'all' || filter === 'activity') ? wq : []
  const label = (FILTERS.find((s) => s.key === filter)?.label ?? '').toLowerCase()
  const pad: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0 28px' }

  if (filter === 'all') {
    // One flat feed, urgent first — no section headers.
    const ordered = [...list].sort((a, b) => (a.band === 'today' ? 0 : 1) - (b.band === 'today' ? 0 : 1))
    return (
      <div style={pad}>
        {q && list.length === 0 && winList.length === 0 && <InboxEmpty icon={Search} title="No matches" sub="Nothing here matches that search." />}
        {!q && list.length === 0 && (
          <div style={{ margin: '4px 14px 2px', background: C.greenSoft, borderRadius: 16, padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div><div style={{ fontWeight: 700, fontSize: 14.5, color: C.greenDk }}>You&apos;re all caught up</div><div style={{ fontSize: 12, color: C.greenDk, opacity: 0.85 }}>Nothing is waiting on you right now.</div></div>
          </div>
        )}
        {ordered.map((i) => <Row key={i.id} item={i} onDismiss={onDismiss} />)}
        {winList.map((w) => <WinLink key={w.id} w={w} />)}
      </div>
    )
  }

  const sorted = [...list].sort((a, b) => (a.band === 'today' ? 0 : 1) - (b.band === 'today' ? 0 : 1))
  if (sorted.length === 0 && winList.length === 0) {
    return (
      <div style={pad}>
        {q
          ? <InboxEmpty icon={Search} title="No matches" sub="Nothing here matches that search." />
          : filter === 'needsyou'
            ? <InboxEmpty icon={Check} title="You're all caught up" sub="Nothing is waiting on you right now." />
            : <InboxEmpty icon={Check} title={`No ${label} right now`} sub={`When something shows up in ${label}, it lands here.`} />}
      </div>
    )
  }
  return (
    <div style={pad}>
      {sorted.map((i) => <Row key={i.id} item={i} onDismiss={onDismiss} />)}
      {winList.map((w) => <WinLink key={w.id} w={w} />)}
    </div>
  )
}

function WinLink({ w }: { w: Win }) {
  return (
    <NotifRow href={w.link ?? undefined} unread={!w.read} time={w.time} onNav={() => { if (!w.read) { void markWinRead(w.id); inboxChanged() } }} avatar={<IconAvatar emoji={w.icon} source={w.source} />}>
      <Lead bold={w.title} rest={w.body || undefined} />
    </NotifRow>
  )
}

/* generic row — every row deep-links to its own page (reviews → the review
   page with AI reply); nothing expands inline. */
function Row({ item, onDismiss }: { item: Item; onDismiss: (id: string) => void }) {
  if (item.review) return <ReviewRow item={item} onDismiss={onDismiss} />
  const isFix = item.kind === 'connection'
  return (
    <NotifRow href={item.href} unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} onNav={() => { void markInboxRead(item.id); inboxChanged() }} avatar={<IconAvatar emoji={item.icon} source={item.source} danger={isFix} />}>
      <Lead bold={item.title} rest={item.subtitle || undefined} />
    </NotifRow>
  )
}

function ReviewRow({ item, onDismiss }: { item: Item; onDismiss: (id: string) => void }) {
  const r = item.review!
  // the platform is what the eye should land on (owner 2026-09-04: "Google shows the Google
  // symbol, TikTok TikTok") — its mark leads, the reviewer's real photo rides as the badge
  const provider = r.source === 'instagram' ? 'instagram' : r.source === 'yelp' ? 'yelp' : r.source === 'facebook' ? 'facebook' : r.source === 'tiktok' ? 'tiktok' : 'google'
  const avatar = (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={provider} size={26} /></div>
      {r.avatar
        ? <img src={r.avatar} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} style={{ position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', background: '#eef0ef' }} />
        : <span style={{ position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: '50%', background: '#eef0ef', border: '2px solid #fff', color: C.mute, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.author.charAt(0).toUpperCase()}</span>}
    </div>
  )
  return (
    <NotifRow href={`/dashboard/reviews/${r.reviewId}`} unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} onNav={() => { void markInboxRead(item.id); inboxChanged() }} avatar={avatar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 14, lineHeight: 1.3, color: C.ink }}>
        <b style={{ fontWeight: 700 }}>{r.author}</b>
        <Stars n={r.rating} />
      </div>
      {r.text && <div style={{ marginTop: 4, fontSize: 13.5, color: C.mute, lineHeight: 1.45, ...clampStyle(3) }}>&ldquo;{r.text}&rdquo;</div>}
    </NotifRow>
  )
}
function Stars({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} color={i <= n ? '#f5a623' : '#dfe3e1'} fill={i <= n ? '#f5a623' : 'none'} />)}</span>
}
