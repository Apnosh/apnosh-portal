'use client'

/**
 * Owner Messages — a real messaging surface for the apnosh-mvp app.
 *
 * The owner can reach the exact person they need: their strategist, a
 * videographer, photographer, designer, or account/support. Each contact is
 * its own conversation. Wired to real data (message_threads / messages) via
 * createThread + sendMessage, with Supabase realtime for live replies. A
 * contact's thread is created lazily on the first message sent, so the picker
 * never leaves empty threads lying around.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useClient } from '@/lib/client-context'
import { ChevronLeft, Search, Send, Loader2, Plus, MessageCircle, Compass, Video, Camera, Image as ImageIcon, CreditCard, HelpCircle } from 'lucide-react'
import { gradOf, glow, type HueKey } from './hues'
import { createClient } from '@/lib/supabase/client'
import { sendMessage, createThread } from '@/lib/actions'
import { markThreadRead } from '@/app/dashboard/messages/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

/* ── The people an owner can reach. Each is its own conversation; the thread
 *  subject carries the role so the Apnosh team knows who it's for. ─────────── */
/* each role gets a colour and a glyph instead of an emoji (portal redesign 2026-09-04) */
interface Contact { key: string; name: string; blurb: string; hue: HueKey; Icon: typeof Compass; color: string; subject: string }
const CONTACTS: Contact[] = [
  { key: 'strategist',   name: 'Your strategist',   blurb: 'Plans, priorities, anything',  hue: 'mint',     Icon: Compass,    color: '#2e9a78', subject: 'Your strategist' },
  { key: 'videographer', name: 'Videographer',      blurb: 'Films your content',           hue: 'event',    Icon: Video,      color: '#2e73b6', subject: 'Videographer' },
  { key: 'photographer', name: 'Photographer',      blurb: 'Photos of your food & space',  hue: 'catering', Icon: Camera,     color: '#9c3a6a', subject: 'Photographer' },
  { key: 'designer',     name: 'Designer',          blurb: 'Graphics, menus, flyers',      hue: 'announce', Icon: ImageIcon,  color: '#ee4c2c', subject: 'Designer' },
  { key: 'account',      name: 'Account & billing', blurb: 'Plans, invoices, payments',    hue: 'nights',   Icon: CreditCard, color: '#3b6fd4', subject: 'Account & billing' },
  { key: 'support',      name: 'Support',           blurb: 'Anything else',                hue: 'mint',     Icon: HelpCircle, color: '#2e9a78', subject: 'Support' },
]
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)
}
// Map a thread's subject back to a contact. Threads this UI creates use a
// contact's exact subject, so they always resolve on the exact pass. Only the
// exact pass + the strategist alias decide UI threads; the word-boundary
// fallback is for legacy / admin-authored free-text subjects, and we never let
// a bare substring (e.g. "designer" inside another word) hijack the match.
function contactForSubject(subject: string): Contact | null {
  const s = (subject || '').trim().toLowerCase()
  if (!s) return null
  for (const c of CONTACTS) if (s === c.subject.toLowerCase()) return c // exact first, across all
  if (s.includes('strateg')) return CONTACTS.find((c) => c.key === 'strategist') ?? null
  for (const c of CONTACTS) if (hasWord(s, c.key) || hasWord(s, c.name.toLowerCase())) return c
  return null
}

interface ThreadRow { id: string; subject: string; lastAt: string; lastMessage: string | null; unread: boolean }
interface Msg { id: string; from: 'owner' | 'team'; senderName: string; text: string; createdAt: string }
/** draft pre-fills the composer (deep links pass who/what the note is about). */
interface Active { threadId: string | null; contact: Contact | null; subject: string; draft?: string }

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m, d); const now = new Date()
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - dt.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return dt.toLocaleDateString('en-US', diff < 7 ? { weekday: 'long' } : { month: 'short', day: 'numeric' })
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MvpMessages({ query: queryProp, onActiveChange }: { query?: string; /** tells the page a conversation is open, so the shell drops its top row and the thread's own header leads */ onActiveChange?: (open: boolean) => void } = {}) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [noBusiness, setNoBusiness] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [active, setActive] = useState<Active | null>(null)
  const deepLinked = useRef(false)
  useEffect(() => { onActiveChange?.(!!active) }, [active, onActiveChange])

  // Resolve the signed-in user + the business (messaging is owner ↔ team). The business
  // comes from the SELECTED client, like every other screen, so a team member or an admin
  // viewing a client sees its threads; the owner-of-record lookup is the fallback.
  const { client: selClient, loading: clientLoading } = useClient()
  useEffect(() => {
    if (clientLoading) return
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (live) setLoading(false); return }
      if (live) setUserId(user.id)
      let bizId: string | null = null
      if (selClient?.id) {
        const { data: byClient } = await supabase.from('businesses').select('id').eq('client_id', selClient.id).maybeSingle()
        bizId = (byClient?.id as string) ?? null
      }
      if (!bizId) {
        const { data: biz } = await supabase.from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
        bizId = (biz?.id as string) ?? null
      }
      if (!live) return
      if (!bizId) { setNoBusiness(true); setLoading(false); return }
      setNoBusiness(false)
      setBusinessId(bizId)
    })()
    return () => { live = false }
  }, [supabase, selClient?.id, clientLoading])

  const loadThreads = useCallback(async () => {
    if (!businessId || !userId) return
    const { data: rows } = await supabase
      .from('message_threads')
      .select('id, subject, last_message_at')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false })
    const enriched: ThreadRow[] = await Promise.all((rows ?? []).map(async (t) => {
      const [{ data: last }, { count }] = await Promise.all([
        supabase.from('messages').select('content').eq('thread_id', t.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('thread_id', t.id).neq('sender_id', userId).is('read_at', null),
      ])
      return { id: t.id as string, subject: (t.subject as string) ?? '', lastAt: t.last_message_at as string, lastMessage: (last?.content as string) ?? null, unread: (count ?? 0) > 0 }
    }))
    setThreads(enriched)
    setLoading(false)
  }, [businessId, userId, supabase])

  useEffect(() => { loadThreads() }, [loadThreads])

  const openContact = useCallback((c: Contact, draft?: string) => {
    const existing = threads.find((t) => contactForSubject(t.subject)?.key === c.key)
    setActive({ threadId: existing?.id ?? null, contact: c, subject: existing?.subject ?? c.subject, draft })
  }, [threads])

  const openThread = useCallback((t: ThreadRow) => {
    setActive({ threadId: t.id, contact: contactForSubject(t.subject), subject: t.subject })
  }, [])

  // Deep link: /dashboard/messages?to=<contactKey> opens that conversation, and
  // ?draft= pre-fills the composer with who/what the note is about. Some older
  // links pass a person id instead of a contact key; there is no person lookup
  // here, so anything unknown lands on the strategist (the router for the whole
  // team) rather than silently doing nothing.
  useEffect(() => {
    if (deepLinked.current || loading || !businessId) return
    deepLinked.current = true
    const params = new URLSearchParams(window.location.search)
    const to = params.get('to')
    if (!to) return
    const draft = params.get('draft') ?? undefined
    const c = CONTACTS.find((x) => x.key === to) ?? CONTACTS.find((x) => x.key === 'strategist')!
    openContact(c, draft)
  }, [loading, businessId, openContact])

  const onBack = () => { setActive(null); loadThreads() }
  const onThreadCreated = () => { loadThreads() }

  if (active) {
    return <Conversation key={active.threadId ?? active.subject} active={active} userId={userId} onBack={onBack} onThreadCreated={onThreadCreated} />
  }

  const q = (queryProp ?? query).trim().toLowerCase()
  const convos = threads.filter((t) => {
    if (!q) return true
    const name = contactForSubject(t.subject)?.name ?? t.subject
    return `${name} ${t.subject} ${t.lastMessage ?? ''}`.toLowerCase().includes(q)
  })
  const activeKeys = new Set(threads.map((t) => contactForSubject(t.subject)?.key).filter(Boolean) as string[])
  const reachable = CONTACTS.filter((c) => !activeKeys.has(c.key) && (!q || `${c.name} ${c.blurb}`.toLowerCase().includes(q)))
  const totalUnread = threads.filter((t) => t.unread).length

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* the top row IS the header now (owner 2026-09-04); the old title / "Reach your Apnosh team" block is gone */}
      {queryProp == null && searchOpen && (
        <div style={{ padding: '12px 16px 0' }}><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages…" style={{ width: '100%', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', border: 'none', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }} /></div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 28px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 30 }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : noBusiness ? (
          <Empty title="No business linked yet" sub="Finish setting up your restaurant to start messaging your team." />
        ) : (
          <>
            {/* one card per group, rows on hairlines (owner 2026-09-04: too much space between chats) */}
            {convos.length > 0 && (
              <>
                <SectionLabel hue="mint">Conversations</SectionLabel>
                <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', overflow: 'hidden', marginBottom: 6 }}>
                  {convos.map((t, i) => <ThreadRowView key={t.id} t={t} first={i === 0} onOpen={() => openThread(t)} />)}
                </div>
              </>
            )}
            {reachable.length > 0 && (
              <>
                <SectionLabel hue="catering">{convos.length ? 'Reach someone else' : 'Reach the right person'}</SectionLabel>
                <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)', overflow: 'hidden' }}>
                  {reachable.map((c, i) => <ContactRowView key={c.key} c={c} first={i === 0} onOpen={() => openContact(c)} />)}
                </div>
              </>
            )}
            {convos.length === 0 && reachable.length === 0 && (
              <Empty title="No matches" sub="No conversations or contacts match that search." />
            )}
          </>
        )}
      </div>
      <style>{`@keyframes mrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.mrise{animation:mrise .26s ease both}`}</style>
    </div>
  )
}

function SectionLabel({ children, hue = 'mint' }: { children: React.ReactNode; hue?: HueKey }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink, margin: '10px 4px 8px' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: gradOf(hue) }} />{children}</div>
}

function Avatar({ c, size = 46 }: { c: Contact | null; size?: number }) {
  const hue: HueKey = c?.hue ?? 'grey'
  const Icon = c?.Icon ?? MessageCircle
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: gradOf(hue), boxShadow: glow(hue, 0.28), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={Math.round(size * 0.42)} /></div>
  )
}

function ThreadRowView({ t, onOpen, first = true }: { t: ThreadRow; onOpen: () => void; first?: boolean }) {
  const c = contactForSubject(t.subject)
  const name = c?.name ?? t.subject
  return (
    <button onClick={onOpen} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderTop: first ? 'none' : `0.5px solid ${C.line}`, padding: '11px 14px', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
      <Avatar c={c} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: t.unread ? 700 : 600, fontSize: 14.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          {c?.key === 'strategist' && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '2px 7px', flexShrink: 0 }}>replies within the hour</span>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: t.unread ? C.greenDk : C.faint, fontWeight: t.unread ? 700 : 400, flexShrink: 0 }}>{timeAgo(t.lastAt)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.unread ? C.ink2 : C.mute, fontWeight: t.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.lastMessage ?? 'No messages yet'}</span>
          {t.unread && <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green, flexShrink: 0 }} />}
        </div>
      </div>
    </button>
  )
}

function ContactRowView({ c, onOpen, first = true }: { c: Contact; onOpen: () => void; first?: boolean }) {
  return (
    <button onClick={onOpen} className="mvp-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderTop: first ? 'none' : `0.5px solid ${C.line}`, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
      <Avatar c={c} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{c.blurb}</div>
      </div>
      <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 99, background: gradOf(c.hue), boxShadow: glow(c.hue, 0.3), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={15} /></span>
    </button>
  )
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mrise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 44px 24px' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><MessageCircle size={24} color={C.green} /></div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

/* ── A single conversation (owner ↔ a specific Apnosh person) ──────────────── */
function Conversation({ active, userId, onBack, onThreadCreated }: { active: Active; userId: string | null; onBack: () => void; onThreadCreated: () => void }) {
  const supabase = createClient()
  const [threadId, setThreadId] = useState<string | null>(active.threadId)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(!!active.threadId)
  // Seed from the deep-link draft; the component remounts per conversation
  // (keyed on threadId/subject) so this never leaks across threads.
  const [input, setInput] = useState(active.draft ?? '')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const c = active.contact

  // Don't toggle `loading` here: it starts true only for an existing thread's
  // first open. On the first-send path load() re-reads after the thread is
  // created, and we don't want the composed bubble to flash back to a spinner.
  const load = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, sender_name, sender_role, content, read_at, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
    const mapped: Msg[] = (data ?? []).map((m) => ({ id: m.id as string, from: (m.sender_role as string) === 'client' ? 'owner' : 'team', senderName: (m.sender_name as string) ?? 'Apnosh', text: (m.content as string) ?? '', createdAt: m.created_at as string }))
    setMsgs(mapped)
    setLoading(false)
    // Mark inbound (team) messages read via a server action — owners have no
    // UPDATE grant on messages, so a browser update would silently no-op.
    if ((data ?? []).some((m) => m.sender_id !== userId && !m.read_at)) void markThreadRead(id)
  }, [supabase, userId])

  useEffect(() => { if (threadId) load(threadId) }, [threadId, load])
  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [msgs])

  // Live replies for this thread.
  useEffect(() => {
    if (!threadId) return
    const ch = supabase
      .channel(`mvp-msg-${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const m = payload.new as Record<string, unknown>
        const row: Msg = { id: m.id as string, from: (m.sender_role as string) === 'client' ? 'owner' : 'team', senderName: (m.sender_name as string) ?? 'Apnosh', text: (m.content as string) ?? '', createdAt: m.created_at as string }
        setMsgs((prev) => {
          if (prev.some((x) => x.id === row.id)) return prev
          // The owner's own send is echoed back here — reconcile it with the
          // optimistic temp row instead of appending a duplicate bubble.
          if (m.sender_id === userId) {
            const idx = prev.findIndex((x) => x.id.startsWith('tmp-') && x.from === 'owner' && x.text === row.text)
            if (idx !== -1) { const copy = prev.slice(); copy[idx] = row; return copy }
          }
          return [...prev, row]
        })
        if (m.sender_id !== userId) void markThreadRead(threadId)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [threadId, supabase, userId])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput(''); setSending(true)
    setMsgs((t) => [...t, { id: `tmp-${Date.now()}`, from: 'owner', senderName: 'You', text, createdAt: new Date().toISOString() }])
    try {
      if (threadId) {
        await sendMessage(threadId, text)
      } else {
        const r = await createThread(active.subject, text)
        if (r.success && r.threadId) { setThreadId(r.threadId); onThreadCreated() }
      }
    } catch { /* keep optimistic */ }
    setSending(false)
  }

  const title = c?.name ?? active.subject
  const hue: HueKey = c?.hue ?? 'mint'
  /* Modern chat layout (owner 2026-09-04): messages group by sender and by day, consecutive
     bubbles sit 3px apart with one tail per group, one avatar per group, one time per group. */
  const groups: { from: Msg['from']; day: string; msgs: Msg[] }[] = []
  for (const m of msgs) {
    const day = dayKey(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.from === m.from && last.day === day && Date.parse(m.createdAt) - Date.parse(last.msgs[last.msgs.length - 1].createdAt) < 5 * 60_000) last.msgs.push(m)
    else groups.push({ from: m.from, day, msgs: [m] })
  }
  const lastOwn = [...msgs].reverse().find((m) => m.from === 'owner')
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* conversation header: glass back circle, avatar, name, status */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) 40px', alignItems: 'center', gap: 10, padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px' }}>
        <button onClick={onBack} aria-label="Back" style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.75)', background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><ChevronLeft size={22} /></button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minWidth: 0 }}>
          <Avatar c={c} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{title}</div>
            <div style={{ fontSize: 11.5, color: C.greenDk, fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenBar, flexShrink: 0 }} />{c?.key === 'strategist' ? 'Replies within the hour' : 'Apnosh team'}</div>
          </div>
        </div>
        <span />
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 14px 10px', background: '#fff' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13, padding: 30 }}><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 22, padding: '0 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Avatar c={c} size={56} /></div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Message {title}</div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.55 }}>{c?.blurb ? `${c.blurb}. ` : ''}Say what you need — a real person picks it up.</div>
          </div>
        ) : groups.map((g, gi) => {
          const showDay = gi === 0 || groups[gi - 1].day !== g.day
          const own = g.from === 'owner'
          const lastMsg = g.msgs[g.msgs.length - 1]
          return (
            <div key={g.msgs[0].id}>
              {showDay && <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.faint, padding: '10px 0 8px' }}>{dayLabel(g.day)}</div>}
              <div className="mrise" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', justifyContent: own ? 'flex-end' : 'flex-start', marginTop: gi > 0 && !showDay ? 10 : 0 }}>
                {!own && <Avatar c={c} size={26} />}
                <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
                  {g.msgs.map((m, mi) => {
                    const isLast = mi === g.msgs.length - 1
                    const r = own ? `18px 18px ${isLast ? 4 : 18}px 18px` : `18px 18px 18px ${isLast ? 4 : 18}px`
                    return own
                      ? <div key={m.id} style={{ background: gradOf(hue), color: '#fff', borderRadius: r, padding: '9px 13px', fontSize: 14.5, lineHeight: 1.4, boxShadow: glow(hue, 0.18), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                      : <div key={m.id} style={{ background: '#f0f0f2', color: C.ink, borderRadius: r, padding: '9px 13px', fontSize: 14.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                  })}
                  <div style={{ fontSize: 10.5, color: C.faint, margin: '1px 4px 0' }}>
                    {own ? (lastMsg.id === lastOwn?.id ? (lastMsg.id.startsWith('tmp-') ? 'Sending…' : `Sent · ${clock(lastMsg.createdAt)}`) : clock(lastMsg.createdAt)) : `${lastMsg.senderName} · ${clock(lastMsg.createdAt)}`}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* composer: a glass pill with the send button inside it */}
      <div style={{ flexShrink: 0, padding: '8px 14px calc(96px + env(safe-area-inset-bottom))', background: '#fff' }}>{/* clears the floating bottom nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, borderRadius: 24, padding: '0 5px 0 16px', background: 'rgba(240,241,240,0.72)', border: '1px solid rgba(255,255,255,0.75)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)' }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder={`Message ${title}…`} style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', fontSize: 14.5, color: C.ink, fontFamily: 'inherit', outline: 'none', padding: 0 }} />
          <button onClick={send} disabled={!input.trim() || sending} aria-label="Send" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() ? gradOf(hue) : '#e3e6e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', boxShadow: input.trim() ? glow(hue, 0.35) : 'none', transition: 'background .15s' }}>{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
        </div>
      </div>
      <style>{`@keyframes mrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.mrise{animation:mrise .26s ease both}`}</style>
    </div>
  )
}
