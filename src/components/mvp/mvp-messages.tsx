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
import { ChevronLeft, Search, Send, Loader2, Plus, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage, createThread } from '@/lib/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenBar: '#34c759',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

/* ── The people an owner can reach. Each is its own conversation; the thread
 *  subject carries the role so the Apnosh team knows who it's for. ─────────── */
interface Contact { key: string; name: string; blurb: string; emoji: string; color: string; subject: string }
const CONTACTS: Contact[] = [
  { key: 'strategist',   name: 'Your strategist',   blurb: 'Plans, priorities, anything',  emoji: '🧭', color: '#4abd98', subject: 'Your strategist' },
  { key: 'videographer', name: 'Videographer',      blurb: 'Films your content',           emoji: '🎥', color: '#6366f1', subject: 'Videographer' },
  { key: 'photographer', name: 'Photographer',      blurb: 'Photos of your food & space',  emoji: '📸', color: '#ec4899', subject: 'Photographer' },
  { key: 'designer',     name: 'Designer',          blurb: 'Graphics, menus, flyers',      emoji: '🎨', color: '#f59e0b', subject: 'Designer' },
  { key: 'account',      name: 'Account & billing', blurb: 'Plans, invoices, payments',    emoji: '💳', color: '#0ea5e9', subject: 'Account & billing' },
  { key: 'support',      name: 'Support',           blurb: 'Anything else',                emoji: '💬', color: '#8b5cf6', subject: 'Support' },
]
function contactForSubject(subject: string): Contact | null {
  const s = (subject || '').toLowerCase()
  for (const c of CONTACTS) {
    if (s === c.subject.toLowerCase()) return c
    if (c.key === 'strategist' && s.includes('strateg')) return c
    if (s.includes(c.key) || s.includes(c.name.toLowerCase())) return c
  }
  return null
}

interface ThreadRow { id: string; subject: string; lastAt: string; lastMessage: string | null; unread: boolean }
interface Msg { id: string; from: 'owner' | 'team'; senderName: string; text: string; createdAt: string }
interface Active { threadId: string | null; contact: Contact | null; subject: string }

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

export default function MvpMessages() {
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

  // Resolve the signed-in owner + their business (messaging is owner ↔ team).
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (live) setLoading(false); return }
      if (live) setUserId(user.id)
      const { data: biz } = await supabase.from('businesses').select('id').eq('owner_id', user.id).maybeSingle()
      if (!live) return
      if (!biz?.id) { setNoBusiness(true); setLoading(false); return }
      setBusinessId(biz.id as string)
    })()
    return () => { live = false }
  }, [supabase])

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

  const openContact = useCallback((c: Contact) => {
    const existing = threads.find((t) => contactForSubject(t.subject)?.key === c.key)
    setActive({ threadId: existing?.id ?? null, contact: c, subject: existing?.subject ?? c.subject })
  }, [threads])

  const openThread = useCallback((t: ThreadRow) => {
    setActive({ threadId: t.id, contact: contactForSubject(t.subject), subject: t.subject })
  }, [])

  // Deep link: /dashboard/messages?to=<contactKey> opens that conversation.
  useEffect(() => {
    if (deepLinked.current || loading || !businessId) return
    deepLinked.current = true
    const to = new URLSearchParams(window.location.search).get('to')
    if (to) { const c = CONTACTS.find((x) => x.key === to); if (c) openContact(c) }
  }, [loading, businessId, openContact])

  const onBack = () => { setActive(null); loadThreads() }
  const onThreadCreated = () => { loadThreads() }

  if (active) {
    return <Conversation key={active.threadId ?? active.subject} active={active} userId={userId} onBack={onBack} onThreadCreated={onThreadCreated} />
  }

  const q = query.trim().toLowerCase()
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
      {/* header */}
      <div style={{ padding: '18px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: 1 }}>Messages</div>
            <div style={{ fontSize: 12.5, color: totalUnread ? C.greenDk : C.mute, marginTop: 5, fontWeight: totalUnread ? 600 : 400 }}>
              {totalUnread ? `${totalUnread} new repl${totalUnread === 1 ? 'y' : 'ies'}` : 'Reach your Apnosh team'}
            </div>
          </div>
          <button onClick={() => setSearchOpen((s) => !s)} style={{ width: 38, height: 38, borderRadius: '50%', border: `1px solid ${searchOpen ? C.green : C.line}`, background: searchOpen ? C.greenSoft : '#fff', color: searchOpen ? C.greenDk : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Search size={18} />
          </button>
        </div>
        {searchOpen && (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages…" style={{ width: '100%', marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 13px', fontSize: 14, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 28px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 30 }}><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : noBusiness ? (
          <Empty title="No business linked yet" sub="Finish setting up your restaurant to start messaging your team." />
        ) : (
          <>
            {convos.length > 0 && (
              <>
                <SectionLabel>Conversations</SectionLabel>
                {convos.map((t) => <ThreadRowView key={t.id} t={t} onOpen={() => openThread(t)} />)}
              </>
            )}
            {reachable.length > 0 && (
              <>
                <SectionLabel>{convos.length ? 'Reach someone else' : 'Reach the right person'}</SectionLabel>
                {reachable.map((c) => <ContactRowView key={c.key} c={c} onOpen={() => openContact(c)} />)}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.faint, margin: '6px 2px 9px' }}>{children}</div>
}

function Avatar({ c, size = 46 }: { c: Contact | null; size?: number }) {
  if (!c) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#eef0ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, flexShrink: 0 }}>💬</div>
  )
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `${c.color}1f`, border: `1px solid ${c.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, flexShrink: 0 }}>{c.emoji}</div>
  )
}

function ThreadRowView({ t, onOpen }: { t: ThreadRow; onOpen: () => void }) {
  const c = contactForSubject(t.subject)
  const name = c?.name ?? t.subject
  return (
    <button onClick={onOpen} className="mrise" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 9, boxShadow: '0 1px 2px rgba(0,0,0,.03)', cursor: 'pointer', textAlign: 'left' }}>
      <Avatar c={c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {t.unread && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green, flexShrink: 0 }} />}
          <span style={{ fontWeight: 600, fontSize: 14.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint, flexShrink: 0 }}>{timeAgo(t.lastAt)}</span>
        </div>
        <div style={{ fontSize: 12.5, color: t.unread ? C.ink2 : C.faint, fontWeight: t.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{t.lastMessage ?? 'No messages yet'}</div>
      </div>
    </button>
  )
}

function ContactRowView({ c, onOpen }: { c: Contact; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="mrise" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 9, boxShadow: '0 1px 2px rgba(0,0,0,.03)', cursor: 'pointer', textAlign: 'left' }}>
      <Avatar c={c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{c.blurb}</div>
      </div>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: C.greenSoft, color: C.greenDk, borderRadius: 99, padding: '7px 12px', fontWeight: 700, fontSize: 12.5 }}><Plus size={13} /> Message</span>
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
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const c = active.contact

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, sender_name, sender_role, content, read_at, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
    const mapped: Msg[] = (data ?? []).map((m) => ({ id: m.id as string, from: (m.sender_role as string) === 'client' ? 'owner' : 'team', senderName: (m.sender_name as string) ?? 'Apnosh', text: (m.content as string) ?? '', createdAt: m.created_at as string }))
    setMsgs(mapped)
    setLoading(false)
    const unread = (data ?? []).filter((m) => m.sender_id !== userId && !m.read_at).map((m) => m.id as string)
    if (unread.length) await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
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
        setMsgs((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, { id: m.id as string, from: (m.sender_role as string) === 'client' ? 'owner' : 'team', senderName: (m.sender_name as string) ?? 'Apnosh', text: (m.content as string) ?? '', createdAt: m.created_at as string }])
        if (m.sender_id !== userId && !m.read_at) supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id as string).then(() => {}, () => {})
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
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* conversation header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 6px', borderBottom: `0.5px solid ${C.line}` }}>
        <button onClick={onBack} aria-label="Back" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={24} /></button>
        <Avatar c={c} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.greenBar, flexShrink: 0 }} />Apnosh team · usually replies within a few hours</div>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px', background: '#fbfcfb' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13, padding: 30 }}><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 22, padding: '0 24px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', background: c ? `${c.color}1f` : C.greenSoft, border: c ? `1px solid ${c.color}33` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{c?.emoji ?? '💬'}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, marginBottom: 4 }}>Message {title}</div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.55 }}>{c?.blurb ? `${c.blurb}. ` : ''}Say what you need — a real person picks it up.</div>
          </div>
        ) : msgs.map((m) => m.from === 'owner' ? (
          <div key={m.id} className="mrise" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <div style={{ maxWidth: '82%', background: GRAD, color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', fontSize: 14, lineHeight: 1.42 }}>{m.text}</div>
          </div>
        ) : (
          <div key={m.id} className="mrise" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <Avatar c={c} size={26} />
            <div style={{ maxWidth: '78%' }}>
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.45, color: C.ink }}>{m.text}</div>
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3, marginLeft: 4 }}>{m.senderName} · {timeAgo(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* composer */}
      <div style={{ flexShrink: 0, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: `0.5px solid ${C.line}`, display: 'flex', gap: 9, alignItems: 'center', background: '#fff' }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder={`Message ${title}…`} style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 999, padding: '12px 16px', fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        <button onClick={send} disabled={!input.trim() || sending} style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() ? C.green : '#e3e9e6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={18} />}</button>
      </div>
      <style>{`@keyframes mrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.mrise{animation:mrise .26s ease both}`}</style>
    </div>
  )
}
