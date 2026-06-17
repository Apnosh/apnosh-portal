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
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Check, Star, Loader2, Search, MoreHorizontal } from 'lucide-react'
import { markInboxRead, replyToReview } from '@/app/dashboard/inbox/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  coral: '#c0564f', coralSoft: '#fdeeee', preview: '#f4f5f6',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

type Chip = 'approvals' | 'reviews' | 'todos' | 'fix'
interface Review { reviewId: string; rating: number; author: string; source: string; text: string; suggestedReply: string }
interface Item { id: string; kind: string; chip: Chip; band: 'today' | 'week'; icon: string; title: string; subtitle: string; time: string; href: string; status?: string; unread: boolean; review?: Review }
interface Win { id: string; icon: string; title: string; body: string; time: string; link: string | null; read: boolean }
interface Hist { id: string; icon: string; chip: string; title: string; subtitle: string; outcome: string; day: string; whenIso: string; href?: string }
interface InboxData { items: Item[]; wins: Win[]; history: Hist[]; counts: { needsYou: number; today: number } }

// Single LinkedIn-style pill row (active = filled). History is just another
// pill, so the whole page is one feed with one filter row.
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'approvals', label: 'Approvals' }, { key: 'reviews', label: 'Reviews' },
  { key: 'todos', label: 'Updates' }, { key: 'fix', label: 'Fix-its' }, { key: 'history', label: 'History' },
]
const COUNTED = new Set(['approvals', 'reviews', 'todos', 'fix'])

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

  // Deep link: Home's "Needs your approval" → ?tab=approvals.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && FILTERS.some((f) => f.key === t)) setFilter(t)
  }, [])

  if (error) return <Shell><Centered>Couldn&apos;t load your notifications: {error}</Centered></Shell>
  if (!data) return <Shell><Centered><Loader2 size={16} className="animate-spin" /> Loading your notifications…</Centered></Shell>

  const needsYou = items.length
  const status = needsYou === 0 ? "You're all caught up 🎉" : `${needsYou} thing${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} you`
  const q = query.trim().toLowerCase()
  const countFor = (k: string) => k === 'all' ? items.length : items.filter((i) => i.chip === k).length

  // Removing an item from the open feed (replied review, or dismissed via "⋯").
  const onReplied = (reviewId: string) => setItems((xs) => xs.filter((x) => x.review?.reviewId !== reviewId))
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

      {filter === 'history'
        ? <HistoryView history={data.history} q={q} />
        : <ListView filter={filter} items={items} wins={data.wins} q={q} onReplied={onReplied} onDismiss={onDismiss} />}

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
function Divider({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 16px 4px' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.faint }}>{label}</span>
      {count != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, background: '#eef0ef', borderRadius: 99, padding: '1px 7px' }}>{count}</span>}
      <span style={{ flex: 1 }} />
    </div>
  )
}

/* ── A single flat notification row (LinkedIn-style): avatar · body · time/⋯,
 *  with a full-width divider. Renders as a Link when it has a destination. */
function NotifRow({ href, unread, time, onDismiss, onNav, avatar, children }: { href?: string; unread?: boolean; time?: string; onDismiss?: () => void; onNav?: () => void; avatar: React.ReactNode; children: React.ReactNode }) {
  const frame: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', borderBottom: `0.5px solid ${C.line}`, background: unread ? 'rgba(74,189,152,0.06)' : 'transparent' }
  const inner = (
    <>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingTop: 1, minWidth: 26 }}>
        {time ? <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>{time}</span> : null}
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
function Lead({ bold, rest, lines = 3 }: { bold: string; rest?: string; lines?: number }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.4, color: C.ink, display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      <b style={{ fontWeight: 700 }}>{bold}</b>{rest ? <span style={{ color: C.mute, fontWeight: 400 }}>{' '}{rest}</span> : null}
    </div>
  )
}
// Outlined action button (visual span; the row's own Link carries the nav).
function PillBtn({ label, danger }: { label: string; danger?: boolean }) {
  const col = danger ? C.coral : C.greenDk
  return <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: 10, border: `1.5px solid ${col}`, color: col, borderRadius: 999, padding: '6px 16px', fontWeight: 700, fontSize: 13 }}>{label}</span>
}

const matchItem = (i: Item, q: string) => !q || `${i.title} ${i.subtitle} ${i.review?.text ?? ''}`.toLowerCase().includes(q)

/* ── Feed for the selected filter. "All" leads with "Needs you", then "The
 *  rest", then the quiet wins lane. A single category is a flat list. */
function ListView({ filter, items, wins, q, onReplied, onDismiss }: { filter: string; items: Item[]; wins: Win[]; q: string; onReplied: (id: string) => void; onDismiss: (id: string) => void }) {
  const list = (filter === 'all' ? items : items.filter((i) => i.chip === filter)).filter((i) => matchItem(i, q))
  const winList = filter === 'all' ? (q ? wins.filter((w) => `${w.title} ${w.body}`.toLowerCase().includes(q)) : wins) : []
  const label = (FILTERS.find((s) => s.key === filter)?.label ?? '').toLowerCase()
  const pad: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 0 28px' }

  if (filter === 'all') {
    const today = list.filter((i) => i.band === 'today')
    const rest = list.filter((i) => i.band !== 'today')
    return (
      <div style={pad}>
        {q && list.length === 0 && winList.length === 0 && <InboxEmpty icon={Search} title="No matches" sub="Nothing here matches that search." />}
        {!q && list.length === 0 && (
          <div style={{ margin: '12px 16px 2px', background: C.greenSoft, borderRadius: 14, padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div><div style={{ fontWeight: 700, fontSize: 14.5, color: C.greenDk }}>You&apos;re all caught up</div><div style={{ fontSize: 12, color: C.greenDk, opacity: 0.85 }}>Nothing is waiting on you right now.</div></div>
          </div>
        )}
        {today.length > 0 && <><Divider label="Needs you" count={today.length} />{today.map((i) => <Row key={i.id} item={i} onReplied={onReplied} onDismiss={onDismiss} />)}</>}
        {rest.length > 0 && <><Divider label="The rest" count={rest.length} />{rest.map((i) => <Row key={i.id} item={i} onReplied={onReplied} onDismiss={onDismiss} />)}</>}
        {winList.length > 0 && <><Divider label="Good to know" />{winList.map((w) => <WinLink key={w.id} w={w} />)}</>}
      </div>
    )
  }

  const sorted = [...list].sort((a, b) => (a.band === 'today' ? 0 : 1) - (b.band === 'today' ? 0 : 1))
  return (
    <div style={pad}>
      {sorted.length === 0
        ? (q ? <InboxEmpty icon={Search} title="No matches" sub="Nothing here matches that search." />
             : <InboxEmpty icon={Check} title={`No ${label} right now`} sub={`When something needs you in ${label}, it shows up here.`} />)
        : sorted.map((i) => <Row key={i.id} item={i} onReplied={onReplied} onDismiss={onDismiss} />)}
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

/* generic row — review rows expand for inline reply; everything else deep-links */
function Row({ item, onReplied, onDismiss }: { item: Item; onReplied: (id: string) => void; onDismiss: (id: string) => void }) {
  if (item.review) return <ReviewRow item={item} onReplied={onReplied} onDismiss={onDismiss} />
  const isFix = item.kind === 'connection'
  const cta = isFix ? 'Reconnect' : item.chip === 'approvals' ? 'Review' : null
  return (
    <NotifRow href={item.href} unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} onNav={() => { void markInboxRead(item.id) }} avatar={<IconAvatar emoji={item.icon} danger={isFix} />}>
      <Lead bold={item.title} rest={item.subtitle || undefined} />
      {cta && <PillBtn label={cta} danger={isFix} />}
    </NotifRow>
  )
}

function ReviewRow({ item, onReplied, onDismiss }: { item: Item; onReplied: (id: string) => void; onDismiss: (id: string) => void }) {
  const r = item.review!
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(r.suggestedReply)
  const tone = ['#4abd98', '#a85c3c', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][(r.author.charCodeAt(0) || 0) % 6]
  const source = r.source === 'instagram' ? 'Instagram' : r.source === 'yelp' ? 'Yelp' : 'Google'
  const send = () => { if (!text.trim()) return; void replyToReview(r.reviewId, text.trim()); onReplied(r.reviewId) }
  const avatar = <div style={{ width: 48, height: 48, borderRadius: '50%', background: tone, color: '#fff', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.author.charAt(0).toUpperCase()}</div>
  return (
    <NotifRow unread={item.unread} time={item.time} onDismiss={() => onDismiss(item.id)} avatar={avatar}>
      <div style={{ fontSize: 14, lineHeight: 1.4, color: C.ink }}>
        <b style={{ fontWeight: 700 }}>{r.author}</b><span style={{ color: C.mute }}> left a {r.rating}-star review on {source}.</span>
      </div>
      <div style={{ marginTop: 4 }}><Stars n={r.rating} /></div>
      {r.text && (
        <div style={{ marginTop: 9, background: C.preview, borderRadius: 12, padding: '10px 13px', fontSize: 13, color: C.ink2, lineHeight: 1.45, ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{r.text}</div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ marginTop: 10, border: `1.5px solid ${C.greenDk}`, color: C.greenDk, background: '#fff', borderRadius: 999, padding: '6px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reply</button>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 12, padding: 11, fontSize: 13.5, color: C.ink, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.45 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setOpen(false)} style={{ background: '#fff', border: `1px solid ${C.line}`, color: C.mute, borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={send} style={{ flex: 1, background: GRAD, border: 'none', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Post reply</button>
          </div>
        </div>
      )}
    </NotifRow>
  )
}
function Stars({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} color={i <= n ? '#f5a623' : '#dfe3e1'} fill={i <= n ? '#f5a623' : 'none'} />)}</span>
}

/* ── HISTORY — same flat rows, grouped by day, with a sent-check avatar. */
function HistoryView({ history, q }: { history: Hist[]; q: string }) {
  const filtered = useMemo(() => history.filter((h) => !q || `${h.title} ${h.subtitle} ${h.outcome}`.toLowerCase().includes(q)), [history, q])
  if (!filtered.length) return <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><InboxEmpty icon={Check} title="Nothing here yet" sub="Things you've handled — replies sent, plans shipped, sign-offs — show up here." /></div>
  const days = ['Today', 'Yesterday', 'Earlier']
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 0 28px' }}>
      {days.map((day) => {
        const rows = filtered.filter((h) => h.day === day)
        if (!rows.length) return null
        return (
          <div key={day}>
            <Divider label={day} count={rows.length} />
            {rows.map((h) => (
              <NotifRow key={h.id} href={h.href ?? undefined} avatar={<div style={{ width: 48, height: 48, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={21} color={C.green} /></div>}>
                <Lead bold={h.title} lines={2} />
                <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}><b style={{ color: C.greenDk, fontWeight: 600 }}>{h.outcome}</b> · {h.subtitle}</div>
              </NotifRow>
            ))}
          </div>
        )
      })}
    </div>
  )
}
