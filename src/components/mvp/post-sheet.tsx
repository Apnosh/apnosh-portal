'use client'

/**
 * THE POST, OPENED.
 * =================
 * A tile used to go straight out to the platform. Now it opens this (owner 2026-09-11): what
 * the post did, against what this account usually does; how people watched it when it is a
 * video; where it went when it went to several places, each with its own way out; and what
 * people said under it, sorted into love, questions and complaints, with a suggested reply
 * on the ones that want one. The way out to the post itself is still here, one tap, top right.
 *
 * A sheet rather than a page, for the same reason the split was: it is a detail about a thing
 * on screen, and sending someone away to read it loses their place in the rail.
 *
 * Honest by construction:
 *   - "your usual" is the median of the other posts on this screen, and it only prints with
 *     three or more of them to stand on.
 *   - watch figures print only when the vendor reported them; a photo has none and shows none.
 *   - the comment read is a suggestion. Nothing is sent until the owner taps Send, and that
 *     goes through the same reply path the Inbox uses.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Bookmark, Check, Eye, Heart, Loader2, MessageCircle, MousePointerClick, Send, Share2, UserPlus, X, Image as ImageIcon } from 'lucide-react'
import { C, DISPLAY } from './tokens'
import { BrandOrMark, brandTone, type InsightsPost } from './mvp-insights'
import { cachedComments, loadComments, ownerSafe, type CommentRow } from './mvp-inbox'
import { useClient } from '@/lib/client-context'
import type { CommentReadItem, CommentTone } from '@/app/api/dashboard/comment-read/route'

const DASH = '–'
const name = (pl: string) => (pl ? pl.charAt(0).toUpperCase() + pl.slice(1) : 'Somewhere')
const compact = (n: number) => (n < 1000 ? String(n) : n < 1000000 ? `${Math.floor(n / 1000)}K` : `${Math.floor(n / 1000000)}M`)
const median = (xs: number[]) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** a rate the vendor may report as 0..1 or 0..100; printed as a whole percent either way */
const pct = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v <= 1 ? v * 100 : v))
/** the same permalink with the noise stripped, so two spellings of one post match */
const canon = (u: string | null | undefined) => (u ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
const when = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TONE: Record<CommentTone, { word: string; ink: string; bg: string }> = {
  love: { word: 'Love', ink: C.greenDk, bg: C.greenSoft },
  question: { word: 'Question', ink: '#3b6fd4', bg: '#e9f0fd' },
  complaint: { word: 'Complaint', ink: C.coral, bg: C.coralSoft },
  neutral: { word: 'Comment', ink: C.mute, bg: C.bg },
  spam: { word: 'Spam', ink: C.faint, bg: C.bg },
}

interface Props {
  /** the post, or the same content on several platforms */
  parts: InsightsPost[]
  /** every other post on the screen, for "your usual" */
  peers: InsightsPost[]
  onClose: () => void
}

export default function PostSheet({ parts, peers, onClose }: Props) {
  const { client } = useClient()
  const clientId = client?.id
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = useMemo(() => parts.slice().sort((a, b) => b.reach - a.reach), [parts])
  const best = rows[0]
  const multi = rows.length > 1
  const sum = (f: (x: InsightsPost) => number) => rows.reduce((t, x) => t + (f(x) || 0), 0)
  const views = sum((x) => x.reach)
  const counted = !rows.every((x) => x.pending || x.unreported)
  const platforms = useMemo(() => { const out: string[] = []; for (const x of rows) if (!out.includes(x.platform)) out.push(x.platform); return out }, [rows])
  const kind = best?.type ? best.type.charAt(0).toUpperCase() + best.type.slice(1).toLowerCase() : 'Post'
  const date = best?.postedAt ? new Date(best.postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

  /* "your usual": the other posts on this screen that have a counted number */
  const ids = new Set(parts.map((p) => p.id))
  const others = peers.filter((p) => !ids.has(p.id) && !p.pending && !p.unreported)
  const usual = (f: (x: InsightsPost) => number) => (others.length >= 3 ? median(others.map(f)) : null)
  const usualViews = usual((x) => x.reach)
  const ratio = usualViews && counted ? views / usualViews : null
  const ratioInk = ratio == null ? C.mute : ratio >= 1.2 ? C.greenDk : ratio <= 0.6 ? C.coral : C.mute

  const stats: Array<{ Icon: typeof Heart; label: string; n: number; usual: number | null }> = [
    { Icon: Heart, label: 'Likes', n: sum((x) => x.likes), usual: usual((x) => x.likes) },
    { Icon: MessageCircle, label: 'Comments', n: sum((x) => x.comments ?? 0), usual: usual((x) => x.comments ?? 0) },
    { Icon: Share2, label: 'Shares', n: sum((x) => x.shares ?? 0), usual: usual((x) => x.shares ?? 0) },
    { Icon: Bookmark, label: 'Saves', n: sum((x) => x.saves), usual: usual((x) => x.saves) },
  ]
  /* what it led to: only the numbers the vendor reported for at least one platform */
  const led = (k: 'impressions' | 'clicks' | 'profileViews' | 'follows') => { const vs = rows.map((x) => x.stats?.[k]).filter((v): v is number => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) : null }
  const ledTo: Array<{ Icon: typeof Eye; label: string; n: number | null }> = [
    { Icon: Eye, label: 'Times shown', n: led('impressions') },
    { Icon: MousePointerClick, label: 'Link taps', n: led('clicks') },
    { Icon: UserPlus, label: 'Profile visits', n: led('profileViews') },
    { Icon: UserPlus, label: 'New follows', n: led('follows') },
  ].filter((x) => x.n != null)
  /* A platform that does not report these sends ZEROES, not nulls (TikTok sends every Meta-only
     field as 0). A row of four zeroes is "not reported", and prints as nothing; one real zero
     among real numbers still prints. Same rule for the watch figures below. */
  const ledToShown = ledTo.some((x) => (x.n ?? 0) > 0) ? ledTo : []
  /* how they watched: the first platform that reported it (a reel is one platform's reel) */
  const watched = rows.map((x) => x.stats).find((s) => s && (s.completionRate != null || s.skipRate != null || s.avgWatchSec != null)) ?? null
  const completion = pct(watched?.completionRate)
  const skip = pct(watched?.skipRate)
  const dur = watched?.durationSec ?? null
  /* Meta reports average watch time in milliseconds; a "second" figure larger than any reel
     could be is that. Printed as seconds either way, and never longer than the video. */
  const avgSec = watched?.avgWatchSec == null ? null : Math.round(watched.avgWatchSec > 600 ? watched.avgWatchSec / 1000 : watched.avgWatchSec)
  const avgShare = avgSec != null && dur ? Math.min(1, avgSec / dur) : null
  const watchedShown = (completion ?? 0) > 0 || (skip ?? 0) > 0 || (avgSec ?? 0) > 0

  /* ── the comments under this post ── */
  const [all, setAll] = useState<CommentRow[] | null>(null)
  const [cErr, setCErr] = useState<string | null>(null)
  const [read, setRead] = useState<{ summary: string; items: Map<string, CommentReadItem> } | null>(null)
  const [reading, setReading] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [sendErr, setSendErr] = useState<string | null>(null)
  useEffect(() => {
    if (!clientId) return
    let live = true
    const cached = cachedComments(clientId)
    if (cached) setAll(cached)
    loadComments(clientId).then((r) => { if (live) setAll(r) }).catch((e) => { if (live && !cached) setCErr(ownerSafe(e instanceof Error ? e.message : '')) })
    return () => { live = false }
  }, [clientId])
  const mine = useMemo(() => {
    if (!all) return null
    const links = new Set(parts.map((p) => canon(p.permalink)).filter(Boolean))
    const ext = new Set(parts.map((p) => p.externalId).filter((x): x is string => !!x))
    return all.filter((c) => (c.postPermalink && links.has(canon(c.postPermalink))) || (c.postId && ext.has(c.postId)))
  }, [all, parts])
  const readKey = mine ? mine.map((c) => c.id).join('|') : ''
  useEffect(() => {
    if (!clientId || !mine || mine.length === 0 || reading || read) return
    let live = true
    setReading(true)
    fetch('/api/dashboard/comment-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, caption: best?.caption ?? null, comments: mine.slice(0, 30).map((c) => ({ id: c.id, text: c.text, author: c.authorName })) }),
    }).then((r) => r.json()).then((j: { summary?: string; items?: CommentReadItem[] }) => {
      if (!live) return
      const items = new Map<string, CommentReadItem>()
      for (const it of j.items ?? []) items.set(it.id, it)
      setRead({ summary: j.summary ?? '', items })
      setDrafts((d) => { const n = { ...d }; for (const it of items.values()) if (it.reply && n[it.id] == null) n[it.id] = it.reply; return n })
    }).catch(() => { if (live) setRead({ summary: '', items: new Map() }) }).finally(() => { if (live) setReading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, readKey])

  const toneOf = (c: CommentRow): CommentTone => read?.items.get(c.id)?.tone ?? 'neutral'
  const needsYou = (c: CommentRow) => !c.replied && !sent.has(c.id) && (toneOf(c) === 'question' || toneOf(c) === 'complaint')
  const ordered = useMemo(() => (mine ?? []).slice().sort((a, b) => Number(needsYou(b)) - Number(needsYou(a)) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))), [mine, read, sent]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => { const c: Record<CommentTone, number> = { love: 0, question: 0, complaint: 0, neutral: 0, spam: 0 }; for (const x of mine ?? []) c[toneOf(x)]++; return c }, [mine, read]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (c: CommentRow) => {
    const text = (drafts[c.id] ?? '').trim()
    if (!text || !clientId || sending) return
    setSending(c.id); setSendErr(null)
    try {
      const r = await fetch('/api/dashboard/social-comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, commentId: c.id, postId: c.postId, accountId: c.accountId, text }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(ownerSafe(String(j.error ?? '')))
      setSent((s) => new Set(s).add(c.id))
    } catch (e) { setSendErr(e instanceof Error ? e.message : ownerSafe('')) }
    setSending(null)
  }

  if (!mounted || !best) return null

  const tone = brandTone(best.platform)
  const hero = tone?.grad ?? `linear-gradient(135deg, ${C.green}, ${C.greenDk})`
  const openPill = (href: string, pl: string, solid = true) => (
    <a href={href} target="_blank" rel="noreferrer noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px 0 10px', borderRadius: 99, textDecoration: 'none', fontSize: 12.5, fontWeight: 700, color: solid ? '#fff' : C.ink, background: solid ? (brandTone(pl)?.solid ?? C.ink) : C.bg, whiteSpace: 'nowrap' }}>
      <BrandOrMark provider={pl} size={14} /> {solid ? `Open on ${name(pl)}` : name(pl)} <ArrowUpRight size={13} />
    </a>
  )

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="This post" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(20,22,26,.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 0 calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(0,0,0,.2)' }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: '#e2e2e7', margin: '0 auto 12px' }} />

        {/* ── the post itself ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <span style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0, position: 'relative', overflow: 'hidden', background: best.thumbnailUrl ? `center/cover url(${best.thumbnailUrl})` : '#f1f1f4', display: 'grid', placeItems: 'center' }}>
            {!best.thumbnailUrl && <><span style={{ position: 'absolute', inset: 0, background: hero, opacity: .18 }} /><ImageIcon size={20} color={C.faint} /></>}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, lineHeight: 1.15, letterSpacing: '-.01em' }}>{kind}{date ? ` · ${date}` : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <span style={{ display: 'inline-flex' }}>{platforms.slice(0, 4).map((pl, i) => <span key={pl} style={{ marginLeft: i ? -6 : 0, width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={pl} size={12} /></span>)}</span>
              <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{multi ? `${platforms.map(name).join(', ')}` : name(best.platform)}</span>
            </span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 99, border: 'none', background: '#f2f2f5', color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
        </div>
        {best.caption && <div style={{ padding: '10px 16px 0', fontSize: 13, color: C.mute, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{best.caption}</div>}
        {!multi && best.permalink && <div style={{ padding: '12px 16px 0' }}>{openPill(best.permalink, best.platform)}</div>}

        {/* ── the headline, against your usual ── */}
        <div style={{ margin: '16px 16px 0', borderRadius: 20, padding: '16px 16px 14px', color: '#fff', background: hero, position: 'relative', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: 99, background: 'rgba(255,255,255,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .85 }}>Views{multi ? ' · everywhere' : ''}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1 }}>{counted ? views.toLocaleString() : DASH}</span>
              {ratio != null && <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 9px', borderRadius: 99, background: 'rgba(255,255,255,.92)', color: ratioInk }}>{ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× your usual</span>}
            </div>
            <div style={{ fontSize: 12.5, opacity: .9, marginTop: 6 }}>
              {!counted ? (rows.every((x) => x.unreported) ? 'This kind of post does not report views.' : 'Still counting. Numbers land within a day.')
                : usualViews != null ? `Your usual post here does ${Math.round(usualViews).toLocaleString()}.` : 'A few more posts and this will say how it compares.'}
            </div>
          </div>
        </div>

        {/* ── the four, against usual ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '10px 16px 0' }}>
          {stats.map((s) => { const up = s.usual != null && s.usual > 0 ? s.n / s.usual : null
            return (
              <div key={s.label} style={{ background: C.bg, borderRadius: 14, padding: '10px 8px 9px', textAlign: 'center' }}>
                <s.Icon size={14} color={C.mute} />
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, marginTop: 3, letterSpacing: '-.01em' }}>{compact(s.n)}</div>
                <div style={{ fontSize: 10.5, color: up == null ? C.faint : up >= 1.2 ? C.greenDk : up <= 0.6 ? C.coral : C.mute, marginTop: 1, whiteSpace: 'nowrap' }}>{up == null ? s.label : `${up >= 10 ? Math.round(up) : up.toFixed(1)}× usual`}</div>
              </div>
            ) })}
        </div>

        {/* ── how they watched ── */}
        {watchedShown && (
          <div style={{ margin: '18px 16px 0' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>How they watched</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {completion != null && <Bar label="Watched to the end" value={completion} text={`${completion}%`} ink={C.greenDk} />}
              {skip != null && <Bar label="Skipped past it" value={skip} text={`${skip}%`} ink={C.coral} />}
              {avgSec != null && <Bar label="Watched on average" value={avgShare != null ? avgShare * 100 : 0} text={dur ? `${avgSec}s of ${dur}s` : `${avgSec}s`} ink="#3b6fd4" />}
            </div>
          </div>
        )}

        {/* ── what it led to ── */}
        {ledToShown.length > 0 && (
          <div style={{ margin: '18px 16px 0' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>What it led to</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {ledToShown.map((x) => <span key={x.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 99, background: C.bg, fontSize: 12.5, color: C.ink }}><x.Icon size={13} color={C.mute} /><b style={{ fontWeight: 700 }}>{compact(x.n ?? 0)}</b> {x.label.toLowerCase()}</span>)}
            </div>
          </div>
        )}

        {/* ── where it went, when it went to several places ── */}
        {multi && (
          <div style={{ margin: '18px 16px 0' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>Where it went</div>
            <div style={{ marginTop: 10 }}>
              {rows.map((r) => { const top = Math.max(1, ...rows.map((x) => x.reach))
                return (
                  <div key={r.id} style={{ padding: '11px 0', borderTop: `0.5px solid ${C.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <BrandOrMark provider={r.platform} size={20} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: C.ink }}>{name(r.platform)}</span>
                      <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink }}>{r.unreported || r.pending ? DASH : r.reach.toLocaleString()}</span>
                      <span style={{ fontSize: 11.5, color: C.mute }}>views</span>
                      {r.permalink && <span style={{ marginLeft: 6 }}>{openPill(r.permalink, r.platform, false)}</span>}
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: '#f0f0f3', margin: '9px 0 0 30px', overflow: 'hidden' }}><div style={{ width: `${Math.max(1.5, (r.reach / top) * 100)}%`, height: '100%', borderRadius: 99, background: brandTone(r.platform)?.solid ?? C.green }} /></div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, marginLeft: 30, fontSize: 12, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Heart size={12} /> {compact(r.likes)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageCircle size={12} /> {compact(r.comments ?? 0)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Share2 size={12} /> {compact(r.shares ?? 0)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bookmark size={12} /> {compact(r.saves)}</span>
                    </div>
                  </div>
                ) })}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.45, marginTop: 2 }}>Views are counted differently on each platform. Read this as where it travelled, not as a score.</div>
          </div>
        )}

        {/* ── what people said ── */}
        <div style={{ margin: '20px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink, letterSpacing: '-.01em' }}>What people said</div>
            {mine && mine.length > 0 && <span style={{ fontSize: 12, color: C.mute }}>{mine.length} {mine.length === 1 ? 'comment' : 'comments'}</span>}
            {reading && <Loader2 size={13} color={C.faint} className="mvp-spin" style={{ marginLeft: 'auto' }} />}
          </div>
          {mine && mine.length > 0 && read && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {(['love', 'question', 'complaint'] as CommentTone[]).filter((t) => counts[t] > 0).map((t) => <span key={t} style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 99, background: TONE[t].bg, color: TONE[t].ink }}>{counts[t]} {t === 'love' ? 'love it' : t === 'question' ? (counts[t] === 1 ? 'question' : 'questions') : (counts[t] === 1 ? 'complaint' : 'complaints')}</span>)}
            </div>
          )}
          {read?.summary && <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45, marginTop: 10, padding: '10px 12px', borderRadius: 12, background: C.greenSoft }}>{read.summary}</div>}
          {cErr && !mine && <div style={{ fontSize: 13, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>{cErr}</div>}
          {!cErr && !mine && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>{[0, 1].map((i) => <div key={i} style={{ height: 52, borderRadius: 14, background: C.bg }} />)}</div>}
          {mine && mine.length === 0 && <div style={{ fontSize: 13, color: C.mute, marginTop: 10, lineHeight: 1.45 }}>No comments on this one yet.</div>}
          {sendErr && <div style={{ fontSize: 12.5, color: C.coral, marginTop: 10 }}>{sendErr}</div>}
          <div style={{ marginTop: 6 }}>
            {ordered.map((c) => { const t = toneOf(c); const it = read?.items.get(c.id); const answered = c.replied || sent.has(c.id); const wants = !answered && c.canReply !== false && !!it?.reply
              return (
                <div key={c.id} style={{ padding: '12px 0', borderTop: `0.5px solid ${C.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: TONE[t].bg, color: TONE[t].ink, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{(c.authorName || '?').replace(/^@/, '').charAt(0).toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.authorName}</span>
                        <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap' }}>{when(c.createdAt)}</span>
                        {read && t !== 'neutral' && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: TONE[t].bg, color: TONE[t].ink, whiteSpace: 'nowrap' }}>{TONE[t].word}</span>}
                        {answered && <span style={{ marginLeft: read && t !== 'neutral' ? 4 : 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: C.greenDk, whiteSpace: 'nowrap' }}><Check size={11} strokeWidth={3} /> Replied</span>}
                      </span>
                      <span style={{ display: 'block', fontSize: 13.5, color: C.ink, lineHeight: 1.45, marginTop: 3 }}>{c.text}</span>
                      {it?.why && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 3 }}>{it.why}</span>}
                    </span>
                  </div>
                  {wants && (
                    <div style={{ margin: '10px 0 0 40px', padding: '10px 10px 10px 12px', borderRadius: 14, background: C.bg }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.greenDk }}>Suggested reply</div>
                      <textarea value={drafts[c.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} rows={2}
                        style={{ display: 'block', width: '100%', marginTop: 4, border: 0, outline: 0, resize: 'none', background: 'none', font: 'inherit', fontSize: 13.5, lineHeight: 1.45, color: C.ink, padding: 0, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button type="button" onClick={() => send(c)} disabled={sending === c.id || !(drafts[c.id] ?? '').trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 99, border: 0, background: C.ink, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: sending === c.id ? .7 : 1 }}>
                          {sending === c.id ? <Loader2 size={13} className="mvp-spin" /> : <Send size={13} />} Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Bar({ label, value, text, ink }: { label: string; value: number; text: string; ink: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.ink }}><span>{label}</span><b style={{ fontWeight: 700, color: ink }}>{text}</b></div>
      <div style={{ height: 6, borderRadius: 99, background: '#f0f0f3', marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${Math.max(1.5, Math.min(100, value))}%`, height: '100%', borderRadius: 99, background: ink }} /></div>
    </div>
  )
}
