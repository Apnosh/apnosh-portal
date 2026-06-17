'use client'

/**
 * Owner Inbox — redesigned IA (ported from apnosh-mvp, made more intuitive).
 *
 * Two segments: ALL (everything that needs you, in Today / This week / Good-to-
 * know bands, with type filter chips) and HISTORY (what you've handled). The
 * owner↔team strategist chat is a header icon that opens a slide-in sheet, not
 * a tab. A search icon searches across both. Wired to real data
 * (/api/dashboard/inbox) and real server actions.
 */
import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { Send, Check, Star, Loader2, MessageCircle, Search, X, ChevronRight } from 'lucide-react'
import { markInboxRead, replyToReview, startStrategistThread } from '@/app/dashboard/inbox/actions'
import { sendMessage } from '@/lib/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  amber: '#8a5a0c', amberLine: '#efe2c4', amberBtn: '#c2882f', blue: '#3b82f6',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

type Chip = 'approvals' | 'reviews' | 'todos' | 'fix'
interface Review { reviewId: string; rating: number; author: string; source: string; text: string; suggestedReply: string }
interface Item { id: string; kind: string; chip: Chip; band: 'today' | 'week'; icon: string; title: string; subtitle: string; time: string; href: string; status?: string; unread: boolean; review?: Review }
interface Win { id: string; icon: string; title: string; body: string; time: string; link: string | null; read: boolean }
interface Hist { id: string; icon: string; chip: string; title: string; subtitle: string; outcome: string; day: string; whenIso: string; href?: string }
interface Msg { id: string; from: 'owner' | 'team'; text: string; createdAt: string }
interface InboxData { items: Item[]; wins: Win[]; history: Hist[]; thread: { threadId: string | null; messages: Msg[] }; counts: { needsYou: number; today: number; chatUnread: boolean } }

export default function MvpInbox({ clientId }: { clientId: string }) {
  const [data, setData] = useState<InboxData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seg, setSeg] = useState<'all' | 'history'>('all')  // top level: needs-you vs handled
  const [sub, setSub] = useState<string>('all')              // category sub-filter within All
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let live = true
    fetch(`/api/dashboard/inbox?clientId=${clientId}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j: InboxData) => { if (live) { setData(j); setItems(j.items) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [clientId])

  // Deep links: Home's "Needs your approval" → ?tab=approvals; the header
  // messages icon → ?chat=1 (opens the strategist chat sheet).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('tab')
    if (t && SUBS.some((s) => s.key === t)) { setSeg('all'); setSub(t) }
    if (p.get('chat') === '1') setChatOpen(true)
  }, [])

  if (error) return <Shell><Centered>Couldn&apos;t load your inbox: {error}</Centered></Shell>
  if (!data) return <Shell><Centered><Loader2 size={16} className="animate-spin" /> Loading your inbox…</Centered></Shell>

  const needsYou = items.length
  const status = needsYou === 0 ? "You're all caught up 🎉" : `${needsYou} thing${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} you`
  const q = query.trim().toLowerCase()
  const countFor = (k: string) => k === 'all' ? items.length : items.filter((i) => i.chip === k).length

  // remove a review from the open feed once replied (moves to history conceptually)
  const onReplied = (reviewId: string) => setItems((xs) => xs.filter((x) => x.review?.reviewId !== reviewId))

  return (
    <Shell>
      {/* header */}
      <div style={{ padding: '18px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: 1 }}>Inbox</div>
            <div style={{ fontSize: 12.5, color: needsYou ? C.mute : C.greenDk, marginTop: 5, fontWeight: needsYou ? 400 : 600 }}>{status}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <GlyphBtn onClick={() => setSearchOpen((s) => !s)} active={searchOpen}><Search size={18} /></GlyphBtn>
            <GlyphBtn onClick={() => setChatOpen(true)} dot={data.counts.chatUnread}><MessageCircle size={18} /></GlyphBtn>
          </div>
        </div>
        {searchOpen && (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your inbox…" style={{ width: '100%', marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 13px', fontSize: 14, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
        )}
        {/* top level — All (needs you) vs History (handled) */}
        <div style={{ display: 'flex', background: '#eef0ef', borderRadius: 12, padding: 3, gap: 3, marginTop: 14 }}>
          <SegBtn label="All" active={seg === 'all'} onClick={() => setSeg('all')} />
          <SegBtn label="History" active={seg === 'history'} onClick={() => setSeg('history')} />
        </div>
        {/* sub-filters within All */}
        {seg === 'all' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 11, overflowX: 'auto', paddingBottom: 2 }}>
            {SUBS.map((t) => <TabPill key={t.key} label={t.label} count={t.key === 'all' ? undefined : countFor(t.key)} active={sub === t.key} onClick={() => setSub(t.key)} />)}
          </div>
        )}
      </div>

      {seg === 'history'
        ? <HistoryView history={data.history} q={q} />
        : <ListView sub={sub} items={items} wins={data.wins} q={q} onReplied={onReplied} />}

      {chatOpen && <ChatSheet initial={data.thread} onClose={() => setChatOpen(false)} />}
      <style>{`@keyframes inrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.inrise{animation:inrise .28s ease both}@keyframes sheetin{from{transform:translateY(100%)}to{transform:none}}`}</style>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</div>
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 24, textAlign: 'center' }}>{children}</div>
}
function GlyphBtn({ children, onClick, active, dot }: { children: React.ReactNode; onClick: () => void; active?: boolean; dot?: boolean }) {
  return (
    <button onClick={onClick} style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', border: `1px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff', color: active ? C.greenDk : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
      {dot && <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 99, background: C.blue, border: '1.5px solid #fff' }} />}
    </button>
  )
}
// Top-level segmented control: All (needs you) vs History (handled).
function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} style={{ flex: 1, borderRadius: 9, border: 'none', padding: '7px 0', fontSize: 13.5, fontWeight: active ? 700 : 600, color: active ? C.ink : C.mute, background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,.08)' : 'none', cursor: 'pointer', transition: 'all .15s' }}>{label}</button>
}

// Category sub-filters shown under All — every category visible, one list at a
// time. The "All" sub-filter groups its list into "Needs you" then "The rest".
const SUBS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'approvals', label: 'Approvals' }, { key: 'reviews', label: 'Reviews' },
  { key: 'todos', label: 'To-dos' }, { key: 'fix', label: 'Fix-its' },
]
function TabPill({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff', color: active ? C.greenDk : C.mute, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all .15s' }}>
      {label}{count ? <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: active ? C.green : '#eef0ef', color: active ? '#fff' : C.faint, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span> : null}
    </button>
  )
}
function InboxEmpty({ icon: Icon, title, sub }: { icon: typeof Check; title: string; sub: string }) {
  return (
    <div className="inrise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '36px 44px 24px' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon size={25} color={C.green} /></div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}
function Divider({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 2px 8px' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.faint }}>{label}</span>
      {count != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, background: '#eef0ef', borderRadius: 99, padding: '1px 7px' }}>{count}</span>}
      <span style={{ flex: 1, height: 1, background: C.line }} />
    </div>
  )
}

const matchItem = (i: Item, q: string) => !q || `${i.title} ${i.subtitle} ${i.review?.text ?? ''}`.toLowerCase().includes(q)

/* ── List for the selected sub-filter. The "All" sub-filter groups into
 *  "Needs you" (urgent) then "The rest", plus the quiet wins lane. A single
 *  category shows just that category's flat list (urgent first). */
function ListView({ sub, items, wins, q, onReplied }: { sub: string; items: Item[]; wins: Win[]; q: string; onReplied: (id: string) => void }) {
  const list = (sub === 'all' ? items : items.filter((i) => i.chip === sub)).filter((i) => matchItem(i, q))
  const winList = sub === 'all' ? (q ? wins.filter((w) => `${w.title} ${w.body}`.toLowerCase().includes(q)) : wins) : []
  const label = (SUBS.find((s) => s.key === sub)?.label ?? '').toLowerCase()
  const pad: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 16px 28px' }

  if (sub === 'all') {
    const today = list.filter((i) => i.band === 'today')
    const rest = list.filter((i) => i.band !== 'today')
    return (
      <div style={pad}>
        {q && list.length === 0 && winList.length === 0 && <InboxEmpty icon={Search} title="No matches" sub="Nothing in your inbox matches that search." />}
        {!q && list.length === 0 && (
          <div style={{ margin: '6px 0 2px', background: C.greenSoft, borderRadius: 14, padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div><div style={{ fontWeight: 700, fontSize: 14.5, color: C.greenDk }}>You&apos;re all caught up</div><div style={{ fontSize: 12, color: C.greenDk, opacity: 0.85 }}>Nothing is waiting on you right now.</div></div>
          </div>
        )}
        {today.length > 0 && <><Divider label="Needs you" count={today.length} />{today.map((i) => <Row key={i.id} item={i} onReplied={onReplied} />)}</>}
        {rest.length > 0 && <><Divider label="The rest" count={rest.length} />{rest.map((i) => <Row key={i.id} item={i} onReplied={onReplied} />)}</>}
        {winList.length > 0 && <><Divider label="Good to know" />{winList.map((w) => <WinLink key={w.id} w={w} />)}</>}
      </div>
    )
  }

  const sorted = [...list].sort((a, b) => (a.band === 'today' ? 0 : 1) - (b.band === 'today' ? 0 : 1))
  return (
    <div style={pad}>
      {sorted.length === 0
        ? (q ? <InboxEmpty icon={Search} title="No matches" sub="Nothing in your inbox matches that search." />
             : <InboxEmpty icon={Check} title={`No ${label} right now`} sub={`When something needs you in ${label}, it shows up here.`} />)
        : sorted.map((i) => <Row key={i.id} item={i} onReplied={onReplied} />)}
    </div>
  )
}

function WinLink({ w }: { w: Win }) {
  const inner = (
    <div className="inrise" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '10px 12px', marginBottom: 8 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{w.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</div>
        {w.body && <div style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.body}</div>}
      </div>
      <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{w.time}</span>
    </div>
  )
  return w.link ? <Link href={w.link} style={{ textDecoration: 'none' }}>{inner}</Link> : inner
}

/* generic row — review rows expand for inline reply; everything else is a deep link */
function Row({ item, onReplied }: { item: Item; onReplied: (id: string) => void }) {
  if (item.review) return <ReviewRow item={item} onReplied={onReplied} />
  const isFix = item.kind === 'connection'
  const cta = item.kind === 'connection' ? 'Reconnect' : item.kind === 'task' ? null : 'Review'
  return (
    <Link href={item.href} onClick={() => { void markInboxRead(item.id) }} className="inrise" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${isFix ? '#f3d9d9' : C.line}`, borderRadius: 14, padding: 12, marginBottom: 9, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
      <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 11, background: isFix ? '#fdeeee' : C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{item.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.unread && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green, flexShrink: 0 }} />}
          <span style={{ fontWeight: 600, fontSize: 14, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{item.subtitle}{item.time ? ` · ${item.time}` : ''}</div>
      </div>
      {cta
        ? <span style={{ flexShrink: 0, background: isFix ? '#c0564f' : C.amberBtn, color: '#fff', borderRadius: 99, padding: '8px 15px', fontWeight: 700, fontSize: 12.5 }}>{cta}</span>
        : <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />}
    </Link>
  )
}

function ReviewRow({ item, onReplied }: { item: Item; onReplied: (id: string) => void }) {
  const r = item.review!
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(r.suggestedReply)
  const tone = ['#4abd98', '#a85c3c', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][(r.author.charCodeAt(0) || 0) % 6]
  const send = () => { if (!text.trim()) return; void replyToReview(r.reviewId, text.trim()); onReplied(r.reviewId) }
  return (
    <div className="inrise" style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 9, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: tone, color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.author.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.author}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
            <Stars n={r.rating} /><span style={{ fontSize: 11, color: C.faint }}>· {r.source === 'instagram' ? 'Instagram' : r.source === 'yelp' ? 'Yelp' : 'Google'} · {item.time}</span>
          </div>
        </div>
        {!open && <span style={{ flexShrink: 0, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '8px 14px', fontWeight: 700, fontSize: 12.5 }}>Reply</span>}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {r.text && <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 10 }}>{r.text}</div>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 12, padding: 11, fontSize: 13.5, color: C.ink, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.45 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setOpen(false)} style={{ background: '#fff', border: `1px solid ${C.line}`, color: C.mute, borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={send} style={{ flex: 1, background: GRAD, border: 'none', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Post reply</button>
          </div>
        </div>
      )}
    </div>
  )
}
function Stars({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} color={i <= n ? '#f5a623' : '#dfe3e1'} fill={i <= n ? '#f5a623' : 'none'} />)}</span>
}

/* ── HISTORY ───────────────────────────────────────────────────── */
function HistoryView({ history, q }: { history: Hist[]; q: string }) {
  const filtered = useMemo(() => history.filter((h) => !q || `${h.title} ${h.subtitle} ${h.outcome}`.toLowerCase().includes(q)), [history, q])
  if (!filtered.length) return <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><InboxEmpty icon={Check} title="Nothing here yet" sub="Things you've handled — replies sent, plans shipped, sign-offs — show up here." /></div>
  const days = ['Today', 'Yesterday', 'Earlier']
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 28px' }}>
      {days.map((day) => {
        const rows = filtered.filter((h) => h.day === day)
        if (!rows.length) return null
        return (
          <div key={day}>
            <Divider label={day} count={rows.length} />
            {rows.map((h) => {
              const inner = (
                <div className="inrise" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '11px 12px', marginBottom: 8, opacity: 0.92 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={15} color={C.green} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                    <div style={{ fontSize: 11.5, color: C.faint }}><b style={{ color: C.greenDk, fontWeight: 600 }}>{h.outcome}</b> · {h.subtitle}</div>
                  </div>
                  {h.href && <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
                </div>
              )
              return h.href ? <Link key={h.id} href={h.href} style={{ textDecoration: 'none' }}>{inner}</Link> : <div key={h.id}>{inner}</div>
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ── CHAT SHEET (owner ↔ Apnosh team) ──────────────────────────── */
function ChatSheet({ initial, onClose }: { initial: { threadId: string | null; messages: Msg[] }; onClose: () => void }) {
  const [threadId, setThreadId] = useState(initial.threadId)
  const [thread, setThread] = useState<Msg[]>(initial.messages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [thread])
  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput(''); setSending(true)
    setThread((t) => [...t, { id: `tmp-${Date.now()}`, from: 'owner', text, createdAt: new Date().toISOString() }])
    try {
      if (threadId) await sendMessage(threadId, text)
      else { const r = await startStrategistThread(text); if (r.ok && r.threadId) setThreadId(r.threadId) }
    } catch { /* keep optimistic */ }
    setSending(false)
  }
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(20,20,22,.28)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 52, background: '#fff', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', animation: 'sheetin .25s ease', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, flexShrink: 0 }}>S</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Your strategist</div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenBar }} />Real people · usually reply within a few hours</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {thread.length === 0 && <div style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, marginTop: 20, lineHeight: 1.6 }}>Your private line to your strategist.<br />Ask anything — your plan, a post, your numbers.</div>}
          {thread.map((m) => m.from === 'owner' ? (
            <div key={m.id} className="inrise" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <div style={{ maxWidth: '82%', background: GRAD, color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.42 }}>{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="inrise" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: GRAD, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>S</div>
              <div style={{ maxWidth: '80%', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.45, color: C.ink }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 14px calc(14px + env(safe-area-inset-bottom))', borderTop: `0.5px solid ${C.line}`, flexShrink: 0, display: 'flex', gap: 9, alignItems: 'center' }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder="Message your strategist…" style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 999, padding: '12px 16px', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={send} disabled={!input.trim() || sending} style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() ? C.green : '#e3e9e6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={18} />}</button>
        </div>
      </div>
    </div>
  )
}
