'use client'
/**
 * REPUTATION, READ (owner 2026-09-14): what sits under the Reputation graph on Insights.
 * ======================================================================================
 * Four things, in the order an owner asks them:
 *   1. Your rating: the authoritative Google place rating, how many reviews, where they come
 *      from, and how the reviews split (good / so-so / bad) with the star histogram.
 *   2. What people say: the topics guests praise and the topics they knock, read from the
 *      reviews (review-topics), and the tone of the comments on their posts (comment-read).
 *   3. Needs a reply: the reviews nobody answered, worst first, and the comments that ask a
 *      question or raise a problem, each with a suggested reply. One tap to answer.
 *   4. Reply pace: how many got an answer and how fast.
 *
 * Reviews come from the synced Google reviews (Yelp, Facebook, TripAdvisor and Apple rows show
 * the moment a sync writes them, the summary already folds them in by source). Comments come
 * through the Zernio adapter across Instagram, Facebook, YouTube and TikTok-for-Business.
 * Every count on this screen is checkable: the topics list the reviews behind them, the
 * comment tones come from the comments shown, and nothing is invented when a source is empty;
 * it says so.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Loader2, MessageCircle, Send, Sparkles, Star } from 'lucide-react'
import { C, DISPLAY } from './tokens'
import { cachedComments, loadComments, type CommentRow } from './mvp-inbox'
import { useSharedRange } from './mvp-home'
import type { CommentReadItem, CommentTone } from '@/app/api/dashboard/comment-read/route'

export interface ReadReview { id: string; authorName: string; rating: number; text: string | null; source: string; postedAt: string; replied: boolean; needsReply: boolean }

interface Summary {
  split: { positive: number; neutral: number; negative: number; total: number }
  stars: Record<string, number>
  reply: { total: number; replied: number; unanswered: number; unansweredNegative: number; ratePct?: number | null; medianHours?: number | null }
  sources: Record<string, number>
  placeRating: number | null
  placeRatingCount: number | null
}
interface Topic { name: string; positive: number; negative: number; mentions: number; direction: 'up' | 'down' | 'flat'; quote: string; negQuote: string }
interface Topics { summary: string | null; topics: Topic[]; /** 'ai' | 'cache' when a real read happened, 'none' when it could not */ source?: string }
interface CommentRead { summary: string; items: CommentReadItem[] }
/** /api/dashboard/reviews/queue: every unanswered review we can reach, worst first */
interface Queue { queue: { id: string; rating: number | null; author: string; text: string; postedAt: string | null; waitingDays: number | null }[]; total: number; replied: number; critical: number; unreachable: number }

const TEAL = '#14c3c3', TEAL_DK = '#0f9e9e', TEAL_SOFT = 'rgba(20,195,195,.12)'
const GREEN = '#1fc47a', RED = '#ec1528', AMBER = '#f0a12b'

/** Loved / Complaints: the plain card (owner 2026-09-15, back from the tinted version). A label
 *  in its colour, each topic with its count, the guest's own words under it. Shared by the
 *  reviews and the comments so both read the same way. */
function TopicCard({ tone, title, empty, items }: { tone: 'love' | 'complaint'; title: string; empty: string; items: { name: string; count: number; quote: string | null }[] }) {
  const col = tone === 'love' ? GREEN : RED
  return (
    <div style={CARD}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: col, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {items.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>{empty}</div>}
      {items.map((t) => (
        <div key={t.name} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, fontWeight: 600, color: C.ink }}><span style={{ minWidth: 0 }}>{t.name}</span><span style={{ color: col, flexShrink: 0 }}>{t.count}</span></div>
          {t.quote && <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{t.quote}”</div>}
        </div>
      ))}
    </div>
  )
}
const LIST: React.CSSProperties = { marginTop: 18, padding: '0 2px' }
const H3: React.CSSProperties = { fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.2, color: C.ink }
const CARD: React.CSSProperties = { background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14 }

const DEMO: { summary: Summary; topics: Topics; queue: Queue; comments: CommentRow[]; read: CommentRead } = {
  summary: { split: { positive: 186, neutral: 21, negative: 17, total: 224 }, stars: { '5': 152, '4': 34, '3': 21, '2': 6, '1': 11 }, reply: { total: 224, replied: 201, unanswered: 23, unansweredNegative: 3, ratePct: 90, medianHours: 9 }, sources: { google: 198, yelp: 26 }, placeRating: 4.6, placeRatingCount: 312 },
  topics: { summary: 'Guests come for the popcorn chicken sando and stay for the staff. The wait on Friday nights is the one thing that keeps coming up.', topics: [
    { name: 'Popcorn chicken sando', positive: 41, negative: 1, mentions: 42, direction: 'up', quote: 'the popcorn chicken sando is unreal, crispy and still juicy', negQuote: '' },
    { name: 'Staff', positive: 33, negative: 2, mentions: 35, direction: 'flat', quote: 'the owner came out to say hi and remembered our order', negQuote: 'felt rushed at the counter' },
    { name: 'Bubble tea', positive: 19, negative: 4, mentions: 23, direction: 'flat', quote: 'brown sugar boba was perfect', negQuote: 'my milk tea was watery this time' },
    { name: 'Wait time', positive: 2, negative: 14, mentions: 16, direction: 'down', quote: '', negQuote: 'waited 35 minutes on a Friday for two sandos' },
    { name: 'Prices', positive: 3, negative: 7, mentions: 10, direction: 'flat', quote: 'worth every dollar', negQuote: '$15 for a sando is a lot' },
  ], source: 'ai' },
  queue: { total: 224, replied: 201, critical: 3, unreachable: 0, queue: [
    { id: 'demo-1', rating: 1, author: 'Marcus T.', text: 'Waited 40 minutes for a pickup order that was supposed to be ready. Nobody said sorry. The sando was good but I will not be back for that wait.', postedAt: new Date(Date.now() - 2 * 86400000).toISOString(), waitingDays: 2 },
    { id: 'demo-2', rating: 2, author: 'Priya N.', text: 'Bubble tea was watery and the ice was half the cup. Food was fine.', postedAt: new Date(Date.now() - 4 * 86400000).toISOString(), waitingDays: 4 },
    { id: 'demo-3', rating: 3, author: 'Dan L.', text: 'Good sando, loud room, hard to hear my friend. Would come back for takeout.', postedAt: new Date(Date.now() - 6 * 86400000).toISOString(), waitingDays: 6 },
  ] },
  comments: [
    { id: 'c1', platform: 'instagram', postId: 'p1', accountId: 'a1', authorName: 'jess.eats', text: 'Do you have anything gluten free? Coming Saturday with my sister', createdAt: new Date(Date.now() - 86400000).toISOString(), replied: false, canReply: true, url: null, postPermalink: null, postCaption: null, likes: 2, replies: [] } as unknown as CommentRow,
    { id: 'c2', platform: 'tiktok', postId: 'p2', accountId: 'a1', authorName: 'mike_sea', text: 'Came in after this video. Line out the door but worth it', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), replied: true, canReply: true, url: null, postPermalink: null, postCaption: null, likes: 14, replies: [] } as unknown as CommentRow,
    { id: 'c3', platform: 'instagram', postId: 'p1', accountId: 'a1', authorName: 'tasha.k', text: 'Ordered delivery and the sando arrived soggy :( in store it is perfect', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), replied: false, canReply: true, url: null, postPermalink: null, postCaption: null, likes: 0, replies: [] } as unknown as CommentRow,
  ],
  read: { summary: 'Mostly love for the sando and the boba, a couple of questions about the menu, and one delivery complaint.', items: [
    { id: 'c1', tone: 'question', why: 'asks about gluten free options', reply: 'Hi Jess! Our rice bowls are gluten free and we can do the sando on lettuce. Ask for Ana on Saturday and she will sort you out.' },
    { id: 'c2', tone: 'love', why: 'the line was worth it', reply: null },
    { id: 'c3', tone: 'complaint', why: 'delivery order arrived soggy', reply: 'So sorry Tasha, that is on us. Message us your order number and the next one is ours. We are changing the box so it travels better.' },
  ] },
}

const SOURCE_WORD: Record<string, string> = { google: 'Google', yelp: 'Yelp', facebook: 'Facebook', tripadvisor: 'TripAdvisor', apple_maps: 'Apple Maps', other: 'Other' }
const PLATFORM_WORD: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' }

function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = Math.floor(ms / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day'
  if (d < 30) return `${d} days`
  const m = Math.floor(d / 30)
  return m === 1 ? '1 month' : `${m} months`
}

function StarsRow({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }} aria-label={`${n} stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= Math.round(n) ? AMBER : 'none'} color={i <= Math.round(n) ? AMBER : C.line} strokeWidth={1.5} />)}
    </span>
  )
}

export default function ReputationRead({ clientId, reviews }: { clientId?: string; reviews: ReadReview[] }) {
  /* ?demo=reputation shows the section with sample reviews and comments, so the owner can see
     the whole thing before their own sources fill it (2026-09-14). Nothing is fetched then. */
  const [demo] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'reputation')
  const [summary, setSummary] = useState<Summary | null>(() => (demo ? DEMO.summary : null))
  const [topics, setTopics] = useState<Topics | null>(() => (demo ? DEMO.topics : null))
  const [topicsLoading, setTopicsLoading] = useState(!demo)
  /* the last comment list this browser saw paints at once; the fetch below replaces it */
  const [comments, setComments] = useState<CommentRow[] | null>(() => (demo ? DEMO.comments : (typeof window !== 'undefined' && clientId ? cachedComments(clientId) : null)))
  const [commentsErr, setCommentsErr] = useState(false)
  const [read, setRead] = useState<CommentRead | null>(() => (demo ? DEMO.read : null))
  const [queue, setQueue] = useState<Queue | null>(() => (demo ? DEMO.queue : null))
  /* REPLY IN PLACE (owner 2026-09-14), same as comments on the post sheet: a Reply link opens a
     box under the review, Suggest fills it with a draft in the owner's voice, Send posts it to
     Google through the same route the review page uses. The reply stays under the review and
     Edit reopens it: Google keeps one owner reply per review, so a second send replaces it. */
  const [rOpen, setROpen] = useState<Set<string>>(new Set())
  const [rDraft, setRDraft] = useState<Record<string, string>>({})
  const [rBusy, setRBusy] = useState<string | null>(null)
  const [rSent, setRSent] = useState<Record<string, string>>({})
  const [rErr, setRErr] = useState<Record<string, string>>({})
  /* COMMENTS ARE ANSWERED HERE TOO (owner 2026-09-15: "the suggested reply should go directly
     to the comment"). The card used to link to the Inbox, which has no comments tab, so it
     landed on notifications. Now Use this reply opens a box under the comment with the
     suggestion in it, and Send posts it through the same route the post sheet uses. */
  const [cOpen, setCOpen] = useState<Set<string>>(new Set())
  const [cDraft, setCDraft] = useState<Record<string, string>>({})
  const [cBusy, setCBusy] = useState<string | null>(null)
  const [cSent, setCSent] = useState<Record<string, string[]>>({})
  const [cErr, setCErr] = useState<Record<string, string>>({})
  const openCommentReply = (id: string, seed?: string) => { setCOpen((o) => new Set(o).add(id)); if (seed != null) setCDraft((d) => ({ ...d, [id]: d[id] || seed })) }
  const sendCommentReply = async (c: CommentRow) => {
    const text = (cDraft[c.id] ?? '').trim()
    if (!text || !clientId || cBusy) return
    setCBusy(c.id); setCErr((e) => ({ ...e, [c.id]: '' }))
    try {
      const r = await fetch('/api/dashboard/social-comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, commentId: c.id, postId: c.postId, accountId: c.accountId, text }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(String(j.error ?? 'not posted'))
      setCSent((m) => ({ ...m, [c.id]: [...(m[c.id] ?? []), text] }))
      setCDraft((d) => ({ ...d, [c.id]: '' }))
      setCOpen((o) => { const n = new Set(o); n.delete(c.id); return n })
    } catch { setCErr((e) => ({ ...e, [c.id]: 'We could not post this reply. Try again in a moment.' })) }
    setCBusy(null)
  }
  const openReply = (id: string, seed?: string) => { setROpen((o) => new Set(o).add(id)); if (seed != null) setRDraft((d) => ({ ...d, [id]: seed })) }
  const suggest = async (id: string, rating: number) => {
    setRBusy(`draft:${id}`); setRErr((e) => ({ ...e, [id]: '' }))
    try {
      const r = await fetch('/api/dashboard/reviews/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId: id, tone: rating <= 3 ? 'winback' : 'thankful' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.reply) throw new Error('no draft')
      setRDraft((d) => ({ ...d, [id]: String(j.reply) }))
    } catch { setRErr((e) => ({ ...e, [id]: 'Could not write a draft just now. Your own words work.' })) }
    setRBusy(null)
  }
  const sendReply = async (id: string) => {
    const text = (rDraft[id] ?? '').trim()
    if (!text || rBusy) return
    setRBusy(`send:${id}`); setRErr((e) => ({ ...e, [id]: '' }))
    try {
      const r = await fetch(`/api/dashboard/reviews/${id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replyText: text }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error('not posted')
      setRSent((m) => ({ ...m, [id]: text }))
      setROpen((o) => { const n = new Set(o); n.delete(id); return n })
    } catch { setRErr((e) => ({ ...e, [id]: 'We could not post this to Google. Your team was told.' })) }
    setRBusy(null)
  }

  /* THE SAME DAYS AS THE GRAPH (owner 2026-09-15): every section reads the range picked on
     Insights (7d, 30d, 90d, 1y or custom), so "what people say" is what they said THIS month and
     "needs a reply" is what came in this month, not the whole history. */
  const win = useSharedRange()
  const q = `clientId=${clientId}&from=${win.from}&to=${win.to}`
  useEffect(() => {
    if (!clientId || demo) return
    let live = true
    setTopicsLoading(true)
    fetch(`/api/dashboard/review-summary?${q}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setSummary(j as Summary) }).catch(() => {})
    fetch(`/api/dashboard/review-topics?${q}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) { setTopics(j as Topics | null); setTopicsLoading(false) } }).catch(() => { if (live) setTopicsLoading(false) })
    fetch(`/api/dashboard/reviews/queue?${q}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.queue) setQueue(j as Queue) }).catch(() => {})
    loadComments(clientId).then((rows) => { if (live) setComments(rows.filter((c) => { const d = String(c.createdAt ?? '').slice(0, 10); return d >= win.from && d <= win.to })) }).catch(() => { if (live) { setComments([]); setCommentsErr(true) } })
    return () => { live = false }
  }, [clientId, demo, q, win.from, win.to])

  /* the comments, read once they are here: tone and a suggested reply for the ones that want one */
  useEffect(() => {
    if (!clientId || demo || !comments || comments.length === 0) return
    let live = true
    const batch = [...comments].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 30)
    fetch('/api/dashboard/comment-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, caption: '', comments: batch.map((c) => ({ id: c.id, text: c.text, author: c.authorName })) }) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setRead((j as CommentRead | null) ?? { summary: '', items: [] }) }).catch(() => { if (live) setRead({ summary: '', items: [] }) })
    return () => { live = false }
  }, [clientId, comments, demo])

  /* loading is a fact about the data, not a flag: comments are here and the read is not yet */
  const readLoading = !!comments && comments.length > 0 && !read
  const toneOf = useMemo(() => { const m = new Map<string, CommentReadItem>(); for (const it of read?.items ?? []) m.set(it.id, it); return m }, [read])
  const toneCount = useMemo(() => { const c: Record<CommentTone, number> = { love: 0, question: 0, complaint: 0, neutral: 0, spam: 0 }; for (const it of read?.items ?? []) c[it.tone]++; return c }, [read])

  /* ── 1. the rating ── */
  const stars = summary?.stars ?? {}
  let sampleN = 0, sampleSum = 0
  for (const k of [1, 2, 3, 4, 5]) { const n = stars[String(k)] ?? 0; sampleN += n; sampleSum += k * n }
  /* the window's own average and count; Google's overall listing rating is the small line under */
  const rating = sampleN ? Math.round((sampleSum / sampleN) * 10) / 10 : null
  const count = sampleN
  const split = summary?.split ?? { positive: 0, neutral: 0, negative: 0, total: 0 }
  const sources = Object.entries(summary?.sources ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  /* the comments, summed up (owner 2026-09-14): what was praised and what was knocked, in the
     reader's own eight-word reasons, most repeated first */
  /* THE COMMENTS, BROKEN DOWN THE SAME WAY AS THE REVIEWS (owner 2026-09-15): Loved and
     Complaints, each reason the reader gave counted up, with the comment itself as the quote */
  const commentTopics = useMemo(() => {
    const textOf = new Map((comments ?? []).map((c) => [c.id, c.text]))
    const pick = (tone: CommentTone) => {
      const m = new Map<string, { count: number; quote: string | null }>()
      for (const it of read?.items ?? []) {
        if (it.tone !== tone || !it.why) continue
        const w = it.why.replace(/\.$/, '')
        const k = w.charAt(0).toUpperCase() + w.slice(1)
        const cur = m.get(k)
        if (cur) cur.count++; else m.set(k, { count: 1, quote: textOf.get(it.id) ?? null })
      }
      return [...m.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, 4).map(([name, v]) => ({ name, count: v.count, quote: v.quote }))
    }
    return { loved: pick('love'), complaints: pick('complaint'), asked: pick('question') }
  }, [read, comments])

  /* ── 3. what needs a reply ── */
  /* the queue is the whole listing's backlog, worst first; the page's own recent reviews stand in until it lands */
  const openReviews: { id: string; rating: number; author: string; text: string | null; postedAt: string | null; source: string }[] = queue
    ? queue.queue.slice(0, 5).map((q) => ({ id: q.id, rating: q.rating ?? 0, author: q.author, text: q.text, postedAt: q.postedAt, source: 'google' }))
    : [...reviews].filter((r) => !r.replied && r.needsReply).sort((a, b) => a.rating - b.rating || String(b.postedAt).localeCompare(String(a.postedAt))).slice(0, 5).map((r) => ({ id: r.id, rating: r.rating, author: r.authorName, text: r.text, postedAt: r.postedAt, source: r.source }))
  const openComments = (comments ?? []).filter((c) => !c.replied && (toneOf.get(c.id)?.tone === 'question' || toneOf.get(c.id)?.tone === 'complaint')).slice(0, 5)
  const openReviewTotal = queue ? queue.queue.length : reviews.filter((r) => !r.replied && r.needsReply).length
  const openTotal = openReviewTotal + openComments.length

  const loved = (topics?.topics ?? []).filter((t) => t.positive > 0).sort((a, b) => b.positive - a.positive).slice(0, 4)
  const knocked = (topics?.topics ?? []).filter((t) => t.negative > 0).sort((a, b) => b.negative - a.negative).slice(0, 4)

  return (
    <>
      {/* 1 · your rating */}
      <div style={LIST}>
        <div style={{ ...H3, marginBottom: 8 }}>Your rating</div>
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, lineHeight: 1, letterSpacing: '-.02em', color: C.ink }}>{rating != null ? rating.toFixed(1) : '–'}</span>
            <span style={{ paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <StarsRow n={rating ?? 0} size={15} />
              <span style={{ fontSize: 12.5, color: C.mute }}>{count ? `${count.toLocaleString()} ${count === 1 ? 'review' : 'reviews'} ${win.range === '1y' ? 'this year' : win.range === 'custom' ? 'in this span' : `in ${win.days === 91 ? 90 : win.days} days`}` : `No reviews ${win.range === 'custom' ? 'in this span' : win.label.replace('last', 'in the last')}`}{sources.length ? ` · ${sources.map(([s, n]) => `${SOURCE_WORD[s] ?? s} ${n}`).join(' · ')}` : ''}</span>
            </span>
          </div>
          {summary?.placeRating != null && (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Google shows <b style={{ color: C.mute, fontWeight: 600 }}>{summary.placeRating.toFixed(1)}</b> overall from {Number(summary.placeRatingCount ?? 0).toLocaleString()} reviews</div>
          )}
          {split.total > 0 && (
            <>
              <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 14, gap: 2 }}>
                <span style={{ flex: split.positive, background: GREEN }} /><span style={{ flex: split.neutral, background: C.line }} /><span style={{ flex: split.negative, background: RED }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, fontWeight: 600 }}>
                <span style={{ color: GREEN }}>{split.positive} good</span><span style={{ color: C.mute }}>{split.neutral} so-so</span><span style={{ color: RED }}>{split.negative} bad</span>
              </div>
            </>
          )}
          {sampleN > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
              {[5, 4, 3, 2, 1].map((k) => { const n = stars[String(k)] ?? 0; const w = Math.round((n / Math.max(1, ...[1, 2, 3, 4, 5].map((x) => stars[String(x)] ?? 0))) * 100)
                return <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.mute }}><span style={{ width: 10, textAlign: 'right', fontWeight: 600, color: C.ink }}>{k}</span><Star size={11} fill={AMBER} color={AMBER} /><span style={{ flex: 1, height: 6, borderRadius: 99, background: C.bg, overflow: 'hidden' }}><span style={{ display: 'block', width: `${w}%`, height: '100%', background: k >= 4 ? TEAL : k === 3 ? C.faint : RED, borderRadius: 99 }} /></span><span style={{ width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n}</span></div> })}
            </div>
          )}
          {commentsErr && <div style={{ marginTop: 10, fontSize: 12, color: C.faint }}>Comments could not load right now.</div>}
        </div>
      </div>

      {/* 2 · what people say */}
      <div style={LIST}>
        <div style={{ ...H3, marginBottom: 8 }}>What people say</div>
        {/* the summary sentence is gone (owner 2026-09-15): the two cards say it */}
        {topicsLoading && <div style={{ fontSize: 13, color: C.faint, marginBottom: 8 }}>Reading your reviews…</div>}
        {(loved.length > 0 || knocked.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TopicCard tone="love" title="Loved" empty="Nothing singled out yet." items={loved.map((t) => ({ name: t.name, count: t.positive, quote: t.quote ?? null }))} />
            <TopicCard tone="complaint" title="Complaints" empty="No complaints that repeat." items={knocked.map((t) => ({ name: t.name, count: t.negative, quote: t.negQuote ?? null }))} />
          </div>
        )}
        {(comments?.length ?? 0) > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: TEAL_DK, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}><MessageCircle size={13} /> In the comments on your posts</div>
            {readLoading && !read && <div style={{ fontSize: 12.5, color: C.faint }}>Reading the comments…</div>}
            {read && (toneCount.love + toneCount.complaint > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TopicCard tone="love" title={`Loved · ${toneCount.love}`} empty="Nothing singled out yet." items={commentTopics.loved} />
                <TopicCard tone="complaint" title={`Complaints · ${toneCount.complaint}`} empty="No complaints." items={commentTopics.complaints} />
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.faint }}>Nothing that praises or complains, just chatter.</div>
            ))}
          </div>
        )}
      </div>

      {/* 3 · needs a reply */}
      <div style={LIST}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={H3}>Needs a reply{openTotal > 0 ? ` · ${openTotal}` : ''}</span>
          <Link href="/dashboard/inbox?tab=reviews" style={{ fontSize: 11.5, fontWeight: 600, color: TEAL_DK, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>Open Inbox <ChevronRight size={13} /></Link>
        </div>
        {openReviews.length === 0 && openComments.length === 0 ? (
          <div style={{ ...CARD, fontSize: 13, color: C.mute }}>{queue && queue.unreachable > 0 ? `${queue.unreachable} older ${queue.unreachable === 1 ? 'review has' : 'reviews have'} no reply, and Google gives us no address to answer them.` : 'Nothing waiting. Every review and comment that wanted an answer has one.'}</div>
        ) : (
          /* the waiting reviews and comments run SIDEWAYS, one card at a time (owner 2026-09-15),
             so the section stays one card tall however many are waiting */
          <div className="mvp-swipe" style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -16px', padding: '0 16px 4px', WebkitOverflowScrolling: 'touch', alignItems: 'flex-start' }}>
            {openReviews.map((r) => { const isOpen = rOpen.has(r.id); const sentTx = rSent[r.id]; const col = r.rating <= 2 ? RED : r.rating === 3 ? AMBER : TEAL
              return (
                <div key={r.id} style={{ ...CARD, borderLeft: `3px solid ${col}`, flex: '0 0 84%', maxWidth: 340, scrollSnapAlign: 'start', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.author}</span><StarsRow n={r.rating} size={11} />
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{SOURCE_WORD[r.source] ?? r.source} · {ago(r.postedAt)}</span>
                    <Link href={`/dashboard/reviews/${r.id}`} aria-label="Open the review" style={{ color: C.faint, display: 'inline-flex' }}><ChevronRight size={15} /></Link>
                  </div>
                  {r.text ? <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 4, display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: isOpen ? undefined : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</div> : <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', marginTop: 4 }}>No written comment.</div>}
                  {sentTx && <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${TEAL}`, fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}><b style={{ color: TEAL_DK, fontWeight: 700 }}>You</b> {sentTx}</div>}
                  {isOpen ? (
                    <div style={{ marginTop: 10, padding: '10px 10px 10px 12px', borderRadius: 14, background: C.bg }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: TEAL_DK }}>{sentTx ? 'Edit your reply' : 'Your reply'}</div>
                      <textarea value={rDraft[r.id] ?? ''} onChange={(e) => setRDraft((d) => ({ ...d, [r.id]: e.target.value }))} rows={3} autoFocus placeholder={`Reply to ${r.author}…`}
                        style={{ display: 'block', width: '100%', marginTop: 4, border: 0, outline: 0, resize: 'none', background: 'none', font: 'inherit', fontSize: 13.5, lineHeight: 1.45, color: C.ink, padding: 0, boxSizing: 'border-box' }} />
                      {rErr[r.id] && <div style={{ fontSize: 12, color: RED, marginTop: 4 }}>{rErr[r.id]}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
                        <button type="button" onClick={() => suggest(r.id, r.rating)} disabled={rBusy != null} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 700, color: TEAL_DK, cursor: 'pointer' }}>{rBusy === `draft:${r.id}` ? <Loader2 size={13} className="mvp-spin" /> : <Sparkles size={13} />} Suggest a reply</button>
                        <button type="button" onClick={() => sendReply(r.id)} disabled={rBusy != null || !(rDraft[r.id] ?? '').trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 99, border: 0, background: TEAL_DK, color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: (rDraft[r.id] ?? '').trim() ? 1 : .5 }}>
                          {rBusy === `send:${r.id}` ? <Loader2 size={13} className="mvp-spin" /> : <Send size={13} />} {sentTx ? 'Update' : 'Post to Google'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                      {sentTx && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: TEAL_DK }}><Check size={12} strokeWidth={3} /> Posted to Google</span>}
                      <button type="button" onClick={() => openReply(r.id, sentTx)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: sentTx ? C.mute : TEAL_DK, cursor: 'pointer' }}><MessageCircle size={13} /> {sentTx ? 'Edit reply' : 'Reply'}</button>
                    </div>
                  )}
                </div>
              ) })}
            {openComments.map((c) => { const it = toneOf.get(c.id)!; const col = it.tone === 'complaint' ? RED : AMBER; const isOpen = cOpen.has(c.id); const sentList = cSent[c.id] ?? []
              return (
                <div key={c.id} style={{ ...CARD, borderLeft: `3px solid ${col}`, flex: '0 0 84%', maxWidth: 340, scrollSnapAlign: 'start', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.authorName}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, background: col + '1a', borderRadius: 99, padding: '2px 7px' }}>{it.tone === 'complaint' ? 'Unhappy' : 'Question'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>{PLATFORM_WORD[c.platform] ?? c.platform} · {ago(c.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginTop: 4, display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: isOpen ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.text}</div>
                  {sentList.map((t, i) => <div key={i} style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${TEAL}`, fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}><b style={{ color: TEAL_DK, fontWeight: 700 }}>You</b> {t}</div>)}
                  {isOpen ? (
                    <div style={{ marginTop: 10, padding: '10px 10px 10px 12px', borderRadius: 14, background: C.bg }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: TEAL_DK }}>Your reply</div>
                      <textarea value={cDraft[c.id] ?? ''} onChange={(e) => setCDraft((d) => ({ ...d, [c.id]: e.target.value }))} rows={3} autoFocus placeholder={`Reply to ${c.authorName}…`}
                        style={{ display: 'block', width: '100%', marginTop: 4, border: 0, outline: 0, resize: 'none', background: 'none', font: 'inherit', fontSize: 13.5, lineHeight: 1.45, color: C.ink, padding: 0, boxSizing: 'border-box' }} />
                      {cErr[c.id] && <div style={{ fontSize: 12, color: RED, marginTop: 4 }}>{cErr[c.id]}</div>}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 6, gap: 8 }}>
                        <button type="button" onClick={() => setCOpen((o) => { const n = new Set(o); n.delete(c.id); return n })} style={{ border: 0, background: 'none', padding: '0 6px', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.mute, cursor: 'pointer' }}>Cancel</button>
                        <button type="button" onClick={() => sendCommentReply(c)} disabled={cBusy != null || !(cDraft[c.id] ?? '').trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 99, border: 0, background: TEAL_DK, color: '#fff', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: (cDraft[c.id] ?? '').trim() ? 1 : .5 }}>
                          {cBusy === c.id ? <Loader2 size={13} className="mvp-spin" /> : <Send size={13} />} Post reply
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {it.reply && sentList.length === 0 && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: TEAL_SOFT, fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: TEAL_DK, letterSpacing: '.04em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Suggested reply</span>{it.reply}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        {sentList.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: TEAL_DK }}><Check size={12} strokeWidth={3} /> Replied</span>}
                        <button type="button" onClick={() => openCommentReply(c.id, sentList.length === 0 ? (it.reply ?? '') : '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: sentList.length ? C.mute : TEAL_DK, cursor: 'pointer' }}><MessageCircle size={13} /> {sentList.length ? 'Reply again' : it.reply ? 'Use this reply' : 'Reply'}</button>
                      </div>
                    </>
                  )}
                </div>
              ) })}
          </div>
        )}
      </div>

      {/* the reply-pace line is gone (owner 2026-09-15) */}
    </>
  )
}
