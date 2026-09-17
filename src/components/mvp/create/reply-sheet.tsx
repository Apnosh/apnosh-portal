'use client'
/**
 * REPLY NOW, refined (owner 2026-09-17: "what would people actually want").
 * ========================================================================
 * Two kinds of review, two kinds of attention.
 *   NEEDS CARE   three stars and under. One at a time, the whole review, a draft that takes it
 *                seriously, three quick tweaks (warmer, shorter, more formal), Send or Skip.
 *   SAY THANKS   four and five stars. A compact list, every one drafted in your voice, one
 *                button sends them all. Tap any to read or change it first.
 * Old reviews are answered as old: the draft says the reply is late, once, then answers.
 * Comments on posts underneath. A daily rule at the bottom. A progress line at the top so it
 * feels like finishing something, because it is.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, X, Star } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { cachedComments, loadComments, type CommentRow } from '../mvp-inbox'
import { BrandOrMark } from '../mvp-insights'

interface Queued { id: string; rating: number | null; author: string; text: string; postedAt: string | null; waitingDays: number | null }
interface QueueRead { queue: Queued[]; total: number; replied: number; critical: number; longestWaitDays: number | null; unreachable: number; average: number | null; headline: string }
type Tone = 'thankful' | 'winback' | 'professional' | 'short'
const BATCH = 8
const age = (days: number | null) => (days == null ? '' : days < 1 ? 'today' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days / 30)}mo ago` : `${Math.round(days / 365)}y ago`)

export default function ReplySheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  useEffect(() => {
    const y = window.scrollY; const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }
    b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden'
    return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y) }
  }, [])
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    const v = window.visualViewport
    const read = () => setVv(v ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null)
    read(); v?.addEventListener('resize', read); v?.addEventListener('scroll', read)
    return () => { v?.removeEventListener('resize', read); v?.removeEventListener('scroll', read) }
  }, [])

  const [read, setRead] = useState<QueueRead | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [drafting, setDrafting] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<Set<string>>(new Set())
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [careIndex, setCareIndex] = useState(0)
  const [rule, setRule] = useState<{ enabled: boolean; available: boolean } | null>(null)
  const [comments, setComments] = useState<CommentRow[] | null>(null)
  const [cDrafts, setCDrafts] = useState<Record<string, string>>({})
  const [cSent, setCSent] = useState<Set<string>>(new Set())
  const [cSending, setCSending] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<{ phase: 'writing' | 'sending'; done: number; total: number } | null>(null)
  /* WHERE: All, or any mix of places. Reviews are Google; comments carry their platform. */
  const [where, setWhere] = useState<Set<string>>(new Set())
  const [cWriting, setCWriting] = useState<Set<string>>(new Set())
  const asked = useRef<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    fetch(`/api/dashboard/reviews/queue?clientId=${clientId}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not read your reviews'); return j as QueueRead })
      .then((j) => { if (live) setRead(j) })
      .catch((e) => { if (live) setLoadErr(e instanceof Error ? e.message : 'Could not read your reviews') })
    fetch(`/api/dashboard/reviews/auto-reply?clientId=${clientId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setRule({ enabled: !!j.enabled, available: j.available !== false }) }).catch(() => {})
    const cached = cachedComments(clientId)
    if (cached) setComments(cached.filter((c) => !c.replied && c.canReply !== false))
    loadComments(clientId).then((rows) => { if (live) setComments(rows.filter((c) => !c.replied && c.canReply !== false)) }).catch(() => { if (live && !cached) setComments([]) })
    return () => { live = false }
  }, [clientId])

  const showGoogle = where.size === 0 || where.has('google')
  const waiting = useMemo(() => (showGoogle ? (read?.queue ?? []) : []).filter((q) => !sent.has(q.id) && !skipped.has(q.id)), [read, sent, skipped, showGoogle])
  const openComments = useMemo(() => (comments ?? []).filter((c) => !cSent.has(c.id) && (where.size === 0 || where.has(c.platform))), [comments, cSent, where])
  const places = useMemo(() => { const p = new Map<string, number>(); if (read && read.queue.some((q) => !sent.has(q.id) && !skipped.has(q.id))) p.set('google', read.queue.filter((q) => !sent.has(q.id) && !skipped.has(q.id)).length); for (const c of comments ?? []) if (!cSent.has(c.id)) p.set(c.platform, (p.get(c.platform) ?? 0) + 1); return p }, [read, comments, sent, skipped, cSent])
  const care = useMemo(() => waiting.filter((q) => (q.rating ?? 5) <= 3), [waiting])
  const thanks = useMemo(() => waiting.filter((q) => (q.rating ?? 5) >= 4).sort((a, b) => (a.waitingDays ?? 0) - (b.waitingDays ?? 0)), [waiting])
  const current = care[Math.min(careIndex, Math.max(0, care.length - 1))] ?? null

  /* drafts: the one in front, its two neighbours, and the first thank-yous, in the tone each kind wants */
  const draftMany = async (ids: string[], tone: Tone, fresh = false) => {
    if (!ids.length) return
    setDrafting((s) => { const n = new Set(s); for (const id of ids) n.add(id); return n })
    try {
      const r = await fetch('/api/dashboard/reviews/draft-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, reviewIds: ids, tone, fresh }) })
      const j = (await (r.ok ? r.json() : { drafts: {} })) as { drafts?: Record<string, string> }
      setDrafts((d) => ({ ...d, ...(j.drafts ?? {}) }))
    } catch { /* the card says no draft yet */ }
    finally { setDrafting((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n }) }
  }
  useEffect(() => {
    const needCare = care.slice(careIndex, careIndex + 3).filter((q) => !drafts[q.id] && !asked.current.has(q.id)).map((q) => q.id)
    const needThanks = thanks.slice(0, BATCH).filter((q) => !drafts[q.id] && !asked.current.has(q.id)).map((q) => q.id)
    for (const id of [...needCare, ...needThanks]) asked.current.add(id)
    if (needCare.length) draftMany(needCare, 'winback')
    if (needThanks.length) draftMany(needThanks, 'thankful')
  }, [care, thanks, careIndex, drafts]) // eslint-disable-line react-hooks/exhaustive-deps
  const tweak = (id: string, tone: Tone) => { setDrafts((d) => { const n = { ...d }; delete n[id]; return n }); draftMany([id], tone, true) }

  useEffect(() => {
    if (!comments || !comments.length) return
    const batch = comments.slice(0, 30).filter((c) => !cDrafts[c.id])
    if (!batch.length) return
    fetch('/api/dashboard/comment-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, caption: '', all: true, comments: batch.map((c) => ({ id: c.id, text: c.text, author: c.authorName })) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { id: string; reply: string | null }[] } | null) => { if (!j?.items) return; setCDrafts((d) => { const n = { ...d }; for (const it of j.items!) if (it.reply) n[it.id] = it.reply; return n }) })
      .catch(() => {})
  }, [comments]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (q: Queued, text?: string): Promise<boolean> => {
    const body = (text ?? drafts[q.id] ?? '').trim()
    if (!body || sending.has(q.id)) return false
    setSending((s) => new Set(s).add(q.id)); setErrs((e) => { const n = { ...e }; delete n[q.id]; return n })
    try {
      const r = await fetch(`/api/dashboard/reviews/${q.id}/reply?clientId=${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replyText: body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Google did not take it')
      setSent((s) => new Set(s).add(q.id))
      return true
    } catch (e) { setErrs((x) => ({ ...x, [q.id]: e instanceof Error ? e.message : 'Google did not take it' })); return false }
    finally { setSending((s) => { const n = new Set(s); n.delete(q.id); return n }) }
  }
  /* the one button for the good ones: write what is not written yet, then send every one */
  const sendThanks = async () => {
    if (bulk) return
    const list = thanks.slice()
    const missing = list.filter((q) => !drafts[q.id]?.trim()).map((q) => q.id)
    const got: Record<string, string> = { ...drafts }
    setBulk({ phase: 'writing', done: list.length - missing.length, total: list.length })
    for (let i = 0; i < missing.length; i += BATCH) {
      const ids = missing.slice(i, i + BATCH)
      try {
        const r = await fetch('/api/dashboard/reviews/draft-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, reviewIds: ids, tone: 'thankful' }) })
        const j = (await (r.ok ? r.json() : { drafts: {} })) as { drafts?: Record<string, string> }
        Object.assign(got, j.drafts ?? {})
        setDrafts((d) => ({ ...d, ...(j.drafts ?? {}) }))
      } catch { /* those stay unsent and say so */ }
      setBulk({ phase: 'writing', done: Math.min(list.length, list.length - missing.length + i + ids.length), total: list.length })
    }
    let done = 0
    setBulk({ phase: 'sending', done: 0, total: list.length })
    for (const q of list) { if (got[q.id]?.trim()) await send(q, got[q.id]); done += 1; setBulk({ phase: 'sending', done, total: list.length }) }
    setBulk(null)
  }
  const writeComment = async (c: CommentRow) => {
    if (cWriting.has(c.id)) return
    setCWriting((s) => new Set(s).add(c.id))
    try {
      const r = await fetch('/api/dashboard/comment-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, caption: c.postCaption ?? '', all: true, comments: [{ id: c.id, text: c.text, author: c.authorName }] }) })
      const j = (await (r.ok ? r.json() : null)) as { items?: { id: string; reply: string | null }[] } | null
      const reply = j?.items?.find((x) => x.id === c.id)?.reply
      setCDrafts((d) => ({ ...d, [c.id]: reply ?? d[c.id] ?? '' }))
    } catch { setCDrafts((d) => ({ ...d, [c.id]: d[c.id] ?? '' })) }
    finally { setCWriting((s) => { const n = new Set(s); n.delete(c.id); return n }) }
  }
  const sendComment = async (c: CommentRow) => {
    const text = (cDrafts[c.id] ?? '').trim()
    if (!text || cSending.has(c.id) || !c.postId || !c.accountId) return
    setCSending((s) => new Set(s).add(c.id))
    try {
      const r = await fetch('/api/dashboard/social-comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, commentId: c.id, postId: c.postId, accountId: c.accountId, text }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Did not post')
      setCSent((s) => new Set(s).add(c.id))
    } catch (e) { setErrs((x) => ({ ...x, [c.id]: e instanceof Error ? e.message : 'Did not post' })) }
    finally { setCSending((s) => { const n = new Set(s); n.delete(c.id); return n }) }
  }
  const setRuleOn = async (on: boolean) => {
    setRule((r) => (r ? { ...r, enabled: on } : r))
    await fetch(`/api/dashboard/reviews/auto-reply?clientId=${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) }).catch(() => {})
  }

  if (!mounted) return null
  const cta: React.CSSProperties = { width: '100%', height: 48, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  /* the row under a reply: one small dark pill to send, plain words for the rest */
  const sendBtn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 13, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }
  const textBtn: React.CSSProperties = { height: 34, padding: '0 8px', borderRadius: 99, border: 0, background: 'none', color: C.mute, fontWeight: 600, fontSize: 13, font: 'inherit', cursor: 'pointer' }
  const tweakBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer', font: 'inherit' }
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '20px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const ta: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box', resize: 'none', outline: 'none' }
  const Stars = ({ n }: { n: number | null }) => <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} fill={n != null && i <= n ? '#f0a12b' : 'none'} color={n != null && i <= n ? '#f0a12b' : C.line} strokeWidth={2} />)}</span>
  const total = read ? read.queue.length : 0
  const doneCount = sent.size
  const pct = total ? Math.round(((doneCount + skipped.size) / total) * 100) : 0

  return createPortal(
    <div className="cr" role="dialog" aria-modal="true" aria-label="Reply now" style={{ position: 'fixed', left: 0, right: 0, top: vv ? vv.top : 0, height: vv ? vv.h : '100dvh', zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', touchAction: 'none' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: vv ? vv.h - 16 : '92dvh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', color: C.ink }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 10px' }}>
          <span style={{ width: 34 }} />
          <span style={{ flex: 1, textAlign: 'center', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Reply now</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 99, border: `0.5px solid ${C.line}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {!read && !loadErr && <div style={{ padding: '30px 0', textAlign: 'center', color: C.mute }}><Loader2 size={20} className="mvp-spin" /></div>}
        {loadErr && <div style={{ fontSize: 13, color: '#c92d32', padding: '10px 0' }}>{loadErr}</div>}

        {read && (
          <>
            {/* the top: where you are */}
            <div style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.15 }}>
              {waiting.length === 0 ? (doneCount > 0 ? `All ${doneCount} answered` : 'Every review has a reply') : doneCount > 0 ? `${doneCount} answered, ${waiting.length} to go` : `${waiting.length} waiting`}
            </div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: 4 }}>
              {waiting.length > 0 && <>{care.length > 0 ? `${care.length} need${care.length === 1 ? 's' : ''} care. ` : ''}{thanks.length > 0 ? `${thanks.length} just need${thanks.length === 1 ? 's' : ''} a thank-you. ` : ''}{read.longestWaitDays != null && read.longestWaitDays > 60 ? 'Old ones get a reply that says it is late, then answers.' : ''}</>}
              {waiting.length === 0 && read.unreachable > 0 && `${read.unreachable} more have no address to reply to yet.`}
            </div>
            {total > 0 && <div style={{ height: 4, borderRadius: 2, background: C.line, marginTop: 12, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: C.greenDk, transition: 'width .3s' }} /></div>}
            {places.size > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto' }}>
                <button type="button" onClick={() => setWhere(new Set())} style={{ ...chip(where.size === 0), flex: 'none' }}>All</button>
                {[...places.entries()].map(([p, n]) => { const on = where.has(p); const NAME: Record<string, string> = { google: 'Google', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' }
                  return <button key={p} type="button" onClick={() => setWhere((s) => { const x = new Set(s); if (x.has(p)) x.delete(p); else x.add(p); return x })} style={{ ...chip(on), flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><BrandOrMark provider={p} size={12} /> {NAME[p] ?? p} <span style={{ opacity: .7 }}>{n}</span></button> })}
              </div>
            )}

            {/* NEEDS CARE: one at a time */}
            {care.length > 0 && current && (
              <>
                <div style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}><span>Needs care</span><span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>{Math.min(careIndex + 1, care.length)} of {care.length}</span></div>
                <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 18, padding: '14px 14px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BrandOrMark provider="google" size={14} />
                    <b style={{ fontSize: 14 }}>{current.author}</b>
                    <Stars n={current.rating} />
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint }}>{age(current.waitingDays)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, marginTop: 8, whiteSpace: 'pre-wrap' }}>{current.text || 'No written comment, just the stars.'}</div>
                  <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.mute }}>Your reply</div>
                  {drafts[current.id] != null ? (
                    <textarea value={drafts[current.id]} onChange={(e) => setDrafts((x) => ({ ...x, [current.id]: e.target.value }))} rows={5} style={ta} />
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 13, color: C.mute, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>{drafting.has(current.id) ? <><Loader2 size={14} className="mvp-spin" /> Writing it in your voice</> : 'No draft yet. Tap a tone below.'}</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button type="button" onClick={() => tweak(current.id, 'winback')} style={tweakBtn}>Make it right</button>
                    <button type="button" onClick={() => tweak(current.id, 'thankful')} style={tweakBtn}>Warmer</button>
                    <button type="button" onClick={() => tweak(current.id, 'short')} style={tweakBtn}>Shorter</button>
                    <button type="button" onClick={() => tweak(current.id, 'professional')} style={tweakBtn}>More formal</button>
                  </div>
                  {errs[current.id] && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 8 }}>{errs[current.id]}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
                    <button type="button" onClick={async () => { const ok = await send(current); if (ok) setCareIndex((i) => Math.min(i, Math.max(0, care.length - 2))) }} disabled={!drafts[current.id]?.trim() || sending.has(current.id)} style={{ ...sendBtn, opacity: !drafts[current.id]?.trim() || sending.has(current.id) ? .5 : 1 }}>{sending.has(current.id) ? <Loader2 size={13} className="mvp-spin" /> : <Check size={13} strokeWidth={3} />} Send</button>
                    <button type="button" onClick={() => { setSkipped((s) => new Set(s).add(current.id)); setCareIndex((i) => Math.min(i, Math.max(0, care.length - 2))) }} style={textBtn}>Skip</button>
                    {care.length > 1 && <button type="button" onClick={() => setCareIndex((i) => (i + 1) % care.length)} style={textBtn}>Next</button>}
                    <a href={`/dashboard/reviews/${current.id}`} style={{ marginLeft: 'auto', fontSize: 12, color: C.faint, textDecoration: 'none' }}>Open</a>
                  </div>
                </div>
              </>
            )}

            {/* SAY THANKS: the list, one button */}
            {thanks.length > 0 && (
              <>
                <div style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}><span>Say thanks</span><span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>{thanks.length}</span></div>
                <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 6 }}>Four and five stars. Each gets its own thank-you in your voice. Tap one to read it or change it, or send them all.</div>
                {thanks.slice(0, 12).map((q) => { const isOpen = open.has(q.id); const d = drafts[q.id]
                  return (
                    <div key={q.id} style={{ borderTop: `0.5px solid ${C.line}` }}>
                      <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n })} style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '10px 0', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'left' }}>
                        <Stars n={q.rating} />
                        <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{q.author}</b><span style={{ color: C.mute, fontSize: 12.5 }}> · {q.text ? q.text.slice(0, 60) + (q.text.length > 60 ? '…' : '') : 'stars only'}</span></span>
                        <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>{age(q.waitingDays)}</span>
                        <ChevronDown size={14} color={C.faint} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', flex: 'none' }} />
                      </button>
                      {isOpen && (
                        <div style={{ paddingBottom: 12 }}>
                          {q.text && <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{q.text}</div>}
                          {d != null ? <textarea value={d} onChange={(e) => setDrafts((x) => ({ ...x, [q.id]: e.target.value }))} rows={4} style={ta} /> : <div style={{ fontSize: 13, color: C.mute, padding: '10px 0', display: 'flex', gap: 8, alignItems: 'center' }}>{drafting.has(q.id) ? <><Loader2 size={14} className="mvp-spin" /> Writing</> : 'Written when you send'}</div>}
                          {errs[q.id] && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 6 }}>{errs[q.id]}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                            <button type="button" onClick={() => send(q)} disabled={!d?.trim() || sending.has(q.id)} style={{ ...sendBtn, opacity: !d?.trim() || sending.has(q.id) ? .5 : 1 }}>{sending.has(q.id) ? <Loader2 size={13} className="mvp-spin" /> : <Check size={13} strokeWidth={3} />} Send</button>
                            <button type="button" onClick={() => tweak(q.id, 'short')} style={textBtn}>Shorter</button>
                            <button type="button" onClick={() => setSkipped((s) => new Set(s).add(q.id))} style={textBtn}>Skip</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) })}
                {thanks.length > 12 && <div style={{ fontSize: 12.5, color: C.mute, padding: '8px 0', borderTop: `0.5px solid ${C.line}` }}>and {thanks.length - 12} more, all included below</div>}
                <button type="button" onClick={sendThanks} disabled={!!bulk} style={{ ...cta, marginTop: 12, opacity: bulk ? .7 : 1 }}>
                  {bulk ? <><Loader2 size={16} className="mvp-spin" /> {bulk.phase === 'writing' ? `Writing ${bulk.done} of ${bulk.total}` : `Sending ${bulk.done} of ${bulk.total}`}</> : <><Check size={16} strokeWidth={3} /> Send all {thanks.length} thank-you{thanks.length === 1 ? '' : 's'}</>}
                </button>
                <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 8 }}>Each one different, each one yours. About a minute for {thanks.length}.</div>
              </>
            )}

            {openComments.length > 0 && (
              <>
                <div style={{ ...h3, display: 'flex', justifyContent: 'space-between' }}><span>Comments on your posts</span><span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>{openComments.length}</span></div>
                {openComments.slice(0, 12).map((c) => {
                  const d = cDrafts[c.id]; const busy = cSending.has(c.id); const writing = cWriting.has(c.id)
                  return (
                    <div key={c.id} style={{ borderTop: `0.5px solid ${C.line}`, padding: '10px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BrandOrMark provider={c.platform} size={14} /><b style={{ fontSize: 13.5 }}>{c.authorName}</b>{c.postCaption && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>on: {c.postCaption.slice(0, 40)}</span>}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>{c.text}</div>
                      <textarea value={d ?? ''} onChange={(e) => setCDrafts((x) => ({ ...x, [c.id]: e.target.value }))} rows={2} placeholder={writing ? 'Writing it in your voice' : 'Write a reply, or tap Write it for me'} style={ta} />
                      {errs[c.id] && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 6 }}>{errs[c.id]}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                        <button type="button" onClick={() => sendComment(c)} disabled={!d?.trim() || busy} style={{ ...sendBtn, opacity: !d?.trim() || busy ? .5 : 1 }}>{busy ? <Loader2 size={13} className="mvp-spin" /> : <Check size={13} strokeWidth={3} />} Send</button>
                        <button type="button" onClick={() => writeComment(c)} disabled={writing} style={textBtn}>{writing ? 'Writing' : d?.trim() ? 'Again' : 'Write it for me'}</button>
                        <button type="button" onClick={() => setCSent((s) => new Set(s).add(c.id))} style={textBtn}>Skip</button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {rule && rule.available && (
              <>
                <div style={h3}>Every day, without you</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0 2px', fontSize: 14, fontWeight: 600 }}>
                  <span>Answer the five-star ones for me<small style={sub}>Up to five a day, in your voice, only where nobody replied. Anything under five stars waits here for you.</small></span>
                  <button type="button" role="switch" aria-checked={rule.enabled} onClick={() => setRuleOn(!rule.enabled)} style={{ width: 40, height: 24, borderRadius: 99, border: 0, background: rule.enabled ? C.greenDk : C.line, position: 'relative', flex: 'none', cursor: 'pointer', padding: 0 }}><span style={{ position: 'absolute', top: 2, left: rule.enabled ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} /></button>
                </div>
              </>
            )}
            <button type="button" onClick={onClose} style={{ ...cta, marginTop: 18, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>{doneCount > 0 ? 'Done for now' : 'Close'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10 }}>Replies show on Google within a minute. Change one later from its page.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
