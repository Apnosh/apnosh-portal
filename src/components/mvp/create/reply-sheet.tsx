'use client'
/**
 * REPLY NOW (owner 2026-09-17, the corrected order: promise-keepers first).
 * =====================================================================
 * Everything waiting for a reply, worst first, with a real draft on each in the owner's voice.
 * Fix any, send one, or send all the drafted ones. One switch keeps the five-star replies
 * going every day without them. Reviews post to Google through the reply rail; comments post
 * through the social rail. Nothing is canned: a review with no draft yet says so and drafts
 * on the way in.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, X, Star, RefreshCw } from 'lucide-react'
import { C, DISPLAY } from '../tokens'
import { cachedComments, loadComments, type CommentRow } from '../mvp-inbox'
import { BrandOrMark } from '../mvp-insights'

interface Queued { id: string; rating: number | null; author: string; text: string; postedAt: string | null; waitingDays: number | null }
interface QueueRead { queue: Queued[]; total: number; replied: number; critical: number; longestWaitDays: number | null; unreachable: number; average: number | null; headline: string }
type Tone = 'thankful' | 'winback' | 'professional' | 'short'
const TONES: { id: Tone; label: string }[] = [{ id: 'thankful', label: 'Warm' }, { id: 'winback', label: 'Make it right' }, { id: 'professional', label: 'Polished' }, { id: 'short', label: 'Short' }]
const BATCH = 6

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
  const [tone, setTone] = useState<Tone>('thankful')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [drafting, setDrafting] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<Set<string>>(new Set())
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [shown, setShown] = useState(BATCH)
  const [rule, setRule] = useState<{ enabled: boolean; available: boolean } | null>(null)
  const [comments, setComments] = useState<CommentRow[] | null>(() => null)
  const [cDrafts, setCDrafts] = useState<Record<string, string>>({})
  const [cSent, setCSent] = useState<Set<string>>(new Set())
  const [cSending, setCSending] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const asked = useRef<Set<string>>(new Set())

  /* the queue: every unanswered Google review we hold an address for, worst first */
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

  const waiting = useMemo(() => (read?.queue ?? []).filter((q) => !sent.has(q.id) && !skipped.has(q.id)), [read, sent, skipped])
  const visible = waiting.slice(0, shown)

  /* drafts arrive in batches for what is on screen, in the tone picked; a tone change redrafts */
  useEffect(() => {
    const need = visible.filter((q) => !drafts[q.id] && !asked.current.has(`${q.id}:${tone}`)).slice(0, BATCH)
    if (!need.length) return
    for (const q of need) asked.current.add(`${q.id}:${tone}`)
    setDrafting((s) => { const n = new Set(s); for (const q of need) n.add(q.id); return n })
    fetch('/api/dashboard/reviews/draft-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, reviewIds: need.map((q) => q.id), tone }) })
      .then((r) => (r.ok ? r.json() : { drafts: {} }))
      .then((j: { drafts?: Record<string, string> }) => { setDrafts((d) => ({ ...d, ...(j.drafts ?? {}) })) })
      .catch(() => {})
      .finally(() => setDrafting((s) => { const n = new Set(s); for (const q of need) n.delete(q.id); return n }))
  }, [visible, tone, drafts, clientId])
  const changeTone = (t: Tone) => { setTone(t); setDrafts({}); asked.current.clear() }

  /* comment drafts, read in one batch the way the reputation page does */
  useEffect(() => {
    if (!comments || !comments.length) return
    const batch = comments.slice(0, 30).filter((c) => !cDrafts[c.id])
    if (!batch.length) return
    fetch('/api/dashboard/comment-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, caption: '', comments: batch.map((c) => ({ id: c.id, text: c.text, author: c.authorName })) }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { id: string; reply: string | null }[] } | null) => { if (!j?.items) return; setCDrafts((d) => { const n = { ...d }; for (const it of j.items!) if (it.reply) n[it.id] = it.reply; return n }) })
      .catch(() => {})
  }, [comments]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (q: Queued): Promise<boolean> => {
    const text = (drafts[q.id] ?? '').trim()
    if (!text || sending.has(q.id)) return false
    setSending((s) => new Set(s).add(q.id)); setErrs((e) => { const n = { ...e }; delete n[q.id]; return n })
    try {
      const r = await fetch(`/api/dashboard/reviews/${q.id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replyText: text, clientId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Google did not take it')
      setSent((s) => new Set(s).add(q.id))
      return true
    } catch (e) { setErrs((x) => ({ ...x, [q.id]: e instanceof Error ? e.message : 'Google did not take it' })); return false }
    finally { setSending((s) => { const n = new Set(s); n.delete(q.id); return n }) }
  }
  const sendAll = async () => {
    if (sendingAll) return
    setSendingAll(true)
    for (const q of visible) if (drafts[q.id]?.trim()) await send(q)
    setSendingAll(false)
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
    await fetch(`/api/dashboard/reviews/auto-reply?clientId=${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on, clientId }) }).catch(() => {})
  }

  if (!mounted) return null
  const cta: React.CSSProperties = { width: '100%', height: 48, borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontWeight: 700, fontSize: 15, font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }
  const chip = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: 'pointer', font: 'inherit' })
  const h3: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, margin: '18px 0 8px' }
  const sub: React.CSSProperties = { display: 'block', fontWeight: 500, color: C.mute, fontSize: 12, marginTop: 2 }
  const small = (b: () => void, label: string, disabled = false) => <button type="button" onClick={b} disabled={disabled} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', font: 'inherit', opacity: disabled ? .5 : 1 }}>{label}</button>
  const Stars = ({ n }: { n: number | null }) => <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} fill={n != null && i <= n ? '#f0a12b' : 'none'} color={n != null && i <= n ? '#f0a12b' : C.line} strokeWidth={2} />)}</span>
  const doneCount = sent.size + cSent.size
  const draftedVisible = visible.filter((q) => drafts[q.id]?.trim() && !sending.has(q.id)).length

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
            <div style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', margin: '4px 2px 6px', lineHeight: 1.15 }}>
              {waiting.length === 0 ? 'Every review has a reply' : `${waiting.length} waiting`}
            </div>
            <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45 }}>
              {waiting.length > 0 && <>{read.critical > 0 ? `${read.critical - [...sent, ...skipped].filter((id) => (read.queue.find((q) => q.id === id)?.rating ?? 5) <= 3).length} of them three stars or under, first. ` : ''}{read.longestWaitDays != null && read.longestWaitDays > 0 ? `The oldest has waited ${read.longestWaitDays} days. ` : ''}{read.replied} of {read.total} on your listing already have one.</>}
              {waiting.length === 0 && read.unreachable > 0 && `${read.unreachable} more have no address to reply to yet.`}
            </div>
            {doneCount > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 700, color: C.greenDk }}><Check size={14} strokeWidth={3} /> {doneCount} sent</div>}

            {waiting.length > 0 && (
              <>
                <div style={h3}>In your voice</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{TONES.map((t) => <button key={t.id} type="button" onClick={() => changeTone(t.id)} style={chip(tone === t.id)}>{t.label}</button>)}</div>
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Written from the review, your brand voice, and replies you wrote before. Tap any to change it.</div>
              </>
            )}

            {visible.map((q) => {
              const d = drafts[q.id]; const busy = sending.has(q.id); const isDrafting = drafting.has(q.id)
              return (
                <div key={q.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '12px 12px 10px', marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BrandOrMark provider="google" size={14} />
                    <b style={{ fontSize: 13.5 }}>{q.author}</b>
                    <Stars n={q.rating} />
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.faint }}>{q.waitingDays != null ? `${q.waitingDays}d waiting` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.text || 'No written comment, just the stars.'}</div>
                  <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.mute }}>Your reply</div>
                  {d != null ? (
                    <textarea value={d} onChange={(e) => setDrafts((x) => ({ ...x, [q.id]: e.target.value }))} rows={4} style={{ display: 'block', width: '100%', marginTop: 6, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
                  ) : (
                    <div style={{ marginTop: 6, fontSize: 13, color: C.mute, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>{isDrafting ? <><Loader2 size={14} className="mvp-spin" /> Writing it in your voice</> : 'No draft yet.'}</div>
                  )}
                  {errs[q.id] && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 6 }}>{errs[q.id]}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    <button type="button" onClick={() => send(q)} disabled={!d?.trim() || busy} style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 6, opacity: !d?.trim() || busy ? .5 : 1 }}>{busy ? <Loader2 size={12} className="mvp-spin" /> : <Check size={12} strokeWidth={3} />} Send</button>
                    {small(() => { setDrafts((x) => { const n = { ...x }; delete n[q.id]; return n }); asked.current.delete(`${q.id}:${tone}`) }, 'Again', isDrafting)}
                    {small(() => setSkipped((s) => new Set(s).add(q.id)), 'Skip')}
                    <a href={`/dashboard/reviews/${q.id}`} style={{ marginLeft: 'auto', fontSize: 12, color: C.mute, textDecoration: 'none' }}>Open</a>
                  </div>
                </div>
              )
            })}
            {waiting.length > shown && <button type="button" onClick={() => setShown((n) => n + BATCH)} style={{ ...cta, marginTop: 12, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}`, height: 42, fontSize: 13.5 }}>{Math.min(BATCH, waiting.length - shown)} more</button>}
            {draftedVisible > 1 && <button type="button" onClick={sendAll} disabled={sendingAll} style={{ ...cta, marginTop: 12, opacity: sendingAll ? .6 : 1 }}>{sendingAll ? <Loader2 size={16} className="mvp-spin" /> : <Check size={16} strokeWidth={3} />} Send all {draftedVisible} shown</button>}

            {comments && comments.filter((c) => !cSent.has(c.id)).length > 0 && (
              <>
                <div style={h3}>Comments on your posts</div>
                {comments.filter((c) => !cSent.has(c.id)).slice(0, 10).map((c) => {
                  const d = cDrafts[c.id]; const busy = cSending.has(c.id)
                  return (
                    <div key={c.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '12px 12px 10px', marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BrandOrMark provider={c.platform} size={14} /><b style={{ fontSize: 13.5 }}>{c.authorName}</b></div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>{c.text}</div>
                      {d != null ? <textarea value={d} onChange={(e) => setCDrafts((x) => ({ ...x, [c.id]: e.target.value }))} rows={2} style={{ display: 'block', width: '100%', marginTop: 8, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: C.ink, boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
                        : <div style={{ marginTop: 6, fontSize: 13, color: C.mute, padding: '8px 0' }}>No reply needed, or none drafted yet.</div>}
                      {errs[c.id] && <div style={{ fontSize: 12.5, color: '#c92d32', marginTop: 6 }}>{errs[c.id]}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button type="button" onClick={() => sendComment(c)} disabled={!d?.trim() || busy} style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 6, opacity: !d?.trim() || busy ? .5 : 1 }}>{busy ? <Loader2 size={12} className="mvp-spin" /> : <Check size={12} strokeWidth={3} />} Send</button>
                        {small(() => setCSent((s) => new Set(s).add(c.id)), 'Skip')}
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
                  <span>Reply to five-star reviews for me<small style={sub}>Up to five a day, in your voice, only where nobody replied. You see them in the inbox.</small></span>
                  <button type="button" role="switch" aria-checked={rule.enabled} onClick={() => setRuleOn(!rule.enabled)} style={{ width: 40, height: 24, borderRadius: 99, border: 0, background: rule.enabled ? C.greenDk : C.line, position: 'relative', flex: 'none', cursor: 'pointer', padding: 0 }}><span style={{ position: 'absolute', top: 2, left: rule.enabled ? 18 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .15s' }} /></button>
                </div>
              </>
            )}
            <button type="button" onClick={onClose} style={{ ...cta, marginTop: 18, background: '#fff', color: C.ink, border: `0.5px solid ${C.line}` }}>{doneCount > 0 ? 'Done for now' : 'Close'}</button>
            <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><RefreshCw size={11} /> Replies go to Google within a minute. Comments go straight to the post.</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
