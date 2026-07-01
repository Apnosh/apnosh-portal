'use client'

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
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Star, Loader2, Search, MoreHorizontal } from 'lucide-react'
import { markInboxRead } from '@/app/dashboard/inbox/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#fafafb',
  coral: '#c0564f', coralSoft: '#fdeeee',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

type Chip = 'approvals' | 'reviews' | 'todos' | 'fix'
interface Review { reviewId: string; rating: number; author: string; source: string; text: string; suggestedReply: string }
interface Item { id: string; kind: string; chip: Chip; band: 'today' | 'week'; icon: string; title: string; subtitle: string; time: string; href: string; status?: string; unread: boolean; review?: Review }
interface Win { id: string; icon: string; title: string; body: string; time: string; link: string | null; read: boolean }
interface InboxData { items: Item[]; wins: Win[]; counts: { needsYou: number; today: number } }

// Single LinkedIn-style pill row (active = filled).
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'needsyou', label: 'Needs you' },
  { key: 'reviews', label: 'Reviews' }, { key: 'activity', label: 'Activity' },
]
const COUNTED = new Set(['needsyou', 'reviews', 'activity'])
// Which item chips each filter shows. "Needs you" folds in the old Fix-its
// (broken connections); "Activity" is the tasks/updates + wins stream.
const CHIPS: Record<string, Chip[]> = {
  needsyou: ['approvals', 'fix'],
  reviews: ['reviews'],
  activity: ['todos'],
}
// Old ?tab= deep-link values still resolve (home + suggestion cards use them).
const TAB_ALIAS: Record<string, string> = { approvals: 'needsyou', fix: 'needsyou', reviews: 'reviews', todos: 'activity', all: 'all' }

export default function MvpInbox({ clientId }: { clientId: string }) {
  const [data, setData] = useState<InboxData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])

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
  const status = needsYou === 0 ? "You're all caught up 🎉" : `${needsYou} thing${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} you`
  const q = query.trim().toLowerCase()
  const countFor = (k: string) => k === 'all' ? items.length : items.filter((i) => CHIPS[k]?.includes(i.chip)).length

  // Dismiss an item via the "⋯" (mark read + drop from the feed).
  const onDismiss = (id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); void markInboxRead(id) }

  return (
    <Shell>
      {/* header */}
      <div style={{ padding: '18px 16px 10px', flexShrink: 0, borderBottom: `0.5px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 2px' }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: 1 }}>Notifications</div>
            <div style={{ fontSize: 12.5, color: needsYou ? C.mute : C.greenDk, marginTop: 5, fontWeight: needsYou ? 400 : 600 }}>{status}</div>
          </div>
          <GlyphBtn onClick={() => setSearchOpen((s) => !s)} active={searchOpen}><Search size={18} /></GlyphBtn>
        </div>
        {searchOpen && (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications…" style={{ width: '100%', marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 13px', fontSize: 14, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
        )}
        {/* LinkedIn-style filter pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 13, overflowX: 'auto', paddingBottom: 2 }} className="mvp-swipe-x">
          {FILTERS.map((f) => (
            <FilterPill key={f.key} label={f.label} count={COUNTED.has(f.key) ? countFor(f.key) : undefined} active={filter === f.key} onClick={() => setFilter(f.key)} />
          ))}
        </div>
      </div>

      <ListView filter={filter} items={items} wins={data.wins} q={q} onDismiss={onDismiss} />

      <style>{`@keyframes inrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.inrise{animation:inrise .26s ease both}.mvp-swipe-x{scrollbar-width:none}.mvp-swipe-x::-webkit-scrollbar{display:none}`}</style>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</div>
}
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
function FilterPill({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${active ? C.green : '#d8d8de'}`, background: active ? C.green : '#fff', color: active ? '#fff' : C.ink2, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
      {label}{count ? <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 99, background: active ? 'rgba(255,255,255,0.28)' : '#eef0ef', color: active ? '#fff' : C.faint, fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span> : null}
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
  // Unread = a soft green wash across the whole row + a green dot/timestamp.
  const frame: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: '14px 16px', borderBottom: `0.5px solid ${C.line}`,
    background: unread ? 'rgba(74,189,152,0.07)' : '#fff',
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

function IconAvatar({ emoji, danger }: { emoji: string; danger?: boolean }) {
  return <div style={{ width: 48, height: 48, borderRadius: '50%', background: danger ? C.coralSoft : C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{emoji}</div>
}
const clampStyle = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

function Lead({ bold, rest, lines = 2 }: { bold: string; rest?: string; lines?: number }) {
  // Body clamps to two lines; the trailing "…" signals there's more and the
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
    <NotifRow href={w.link ?? undefined} unread={!w.read} time={w.time} avatar={<IconAvatar emoji={w.icon} />}>
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
    <NotifRow href={item.href} unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} onNav={() => { void markInboxRead(item.id) }} avatar={<IconAvatar emoji={item.icon} danger={isFix} />}>
      <Lead bold={item.title} rest={item.subtitle || undefined} />
    </NotifRow>
  )
}

function ReviewRow({ item, onDismiss }: { item: Item; onDismiss: (id: string) => void }) {
  const r = item.review!
  const tone = ['#4abd98', '#a85c3c', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][(r.author.charCodeAt(0) || 0) % 6]
  const source = r.source === 'instagram' ? 'Instagram' : r.source === 'yelp' ? 'Yelp' : 'Google'
  const avatar = <div style={{ width: 48, height: 48, borderRadius: '50%', background: tone, color: '#fff', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.author.charAt(0).toUpperCase()}</div>
  return (
    <NotifRow href={`/dashboard/reviews/${r.reviewId}`} unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} onNav={() => { void markInboxRead(item.id) }} avatar={avatar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 14, lineHeight: 1.3, color: C.ink }}>
        <b style={{ fontWeight: 700 }}>{r.author}</b>
        <Stars n={r.rating} />
        <span style={{ color: C.faint, fontSize: 12 }}>{source}</span>
      </div>
      {r.text && <div style={{ marginTop: 4, fontSize: 13.5, color: C.mute, lineHeight: 1.45, ...clampStyle(2) }}>&ldquo;{r.text}&rdquo;</div>}
    </NotifRow>
  )
}
function Stars({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} color={i <= n ? '#f5a623' : '#dfe3e1'} fill={i <= n ? '#f5a623' : 'none'} />)}</span>
}
