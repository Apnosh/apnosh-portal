'use client'

/**
 * The proof card (spec R-00): one real number, its context, and the action
 * it traces back to. No system name on the card; the label is always the
 * window plus the surface ("This week on Google"). Renders in the Home
 * banner slot, one at a time, dismissible. Every number comes from the
 * ledger; this component never invents or estimates.
 *
 * A WIN — mint, with a real number in it (src/lib/love/win.ts) — can also carry a `share` link,
 * drawn in the same CTA style as the move a heads-up card carries. It goes to the page where the
 * card becomes a square the owner can send somebody. Nothing else about the card changes.
 */

import { useRef, useState } from 'react'
import { X, ChevronRight, ChevronDown, AlertTriangle, TrendingUp, Heart, Share2, Bookmark, MessageCircle, Star, Play, ArrowRight, Image as ImageIcon, Phone, Navigation, Users, Eye } from 'lucide-react'
import { BrandOrMark } from './mvp-insights'

export interface ProofCardData {
  /** Stable id for dismissal, e.g. "gbp-2026-08-24". */
  id: string
  /** Window + surface, e.g. "This week on Google". */
  label: string
  /** The number line, e.g. "9 calls · 31 direction taps". */
  big: string
  /** The comparison that gives it meaning. */
  context: string
  /** The owner's action, dated. Optional: omitted when no delivered work anchors the window. */
  attribution?: string
  /** Seven daily values for the quiet bars. Optional. */
  spark?: number[]
  /** From proof_cards.fired_at once migrated; drives newest-wins on Home. */
  firedAt?: string
  /** 'win' (mint, default) or 'heads_up' (gray) — the down-week material. */
  tone?: 'win' | 'heads_up'
  /** proof_cards.card_type, kept so a caller can ask whether this card is a WIN (lib/love/win.ts). */
  cardType?: string
  /** proof_cards.is_sample — a seeded demo card is never a win, and never gets a public page. */
  isSample?: boolean
  /** proof_cards.metadata.metricKey — a rating's line is a pair, so the reader needs to know. */
  metricKey?: string
  /** The move a heads-up card carries. Renders as the card's one action. */
  cta?: { label: string; href: string }
  /** A WIN's second door: the page where it becomes something to send somebody. Same CTA style. */
  share?: { label: string; href: string }
  /** proof_cards.metadata: the numbers the card is drawn from, keyed by `kind` (2026-09-12) */
  visual?: Record<string, unknown>
}

export default function ProofCard({ card, onDismiss, onSee, onOpen, defaultOpen = false }: {
  card: ProofCardData
  onDismiss: () => void
  onSee?: () => void
  /** Fired once when the owner opens the win: the strip expands, they tap the card, or its link. */
  onOpen?: () => void
  /** Home renders the slim strip first so the funnel hero keeps its height. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  /* One "they opened it" per card. The deck renders the front card already expanded, so without
     a tap on the card itself the only way to open a WIN was a link most wins do not have — and
     the mark that says a win landed was never written. Once, so a link tap does not double it. */
  const opened = useRef(false)
  const markOpen = () => { if (!opened.current) { opened.current = true; onOpen?.() } }
  const headsUp = card.tone === 'heads_up'
  /* THE COLOUR IS THE SYMBOL (owner 2026-09-12: keep the old card, add the marks). A win carries
     a mint rising arrow, a heads-up an amber warning triangle, beside the label; the card itself
     is the plain white card it always was, no outline. */
  const dotColor = headsUp ? '#e0a13a' : '#4abd98'
  const labelColor = headsUp ? '#9a6b17' : '#2e9a78'
  const Glyph = headsUp ? AlertTriangle : TrendingUp
  const max = card.spark && card.spark.length ? Math.max(...card.spark, 1) : 1
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); markOpen() }}
        className="mvp-rise"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          background: '#fff', border: 'none', borderRadius: 14, padding: '9px 12px', marginBottom: 10,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06)', cursor: 'pointer',
        }}
      >
        <Glyph size={13} color={dotColor} strokeWidth={2.4} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: labelColor, flexShrink: 0 }}>{card.label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.big}</span>
        <ChevronDown size={14} color="#aeaeb2" style={{ flexShrink: 0 }} />
      </button>
    )
  }
  return (
    <div
      className="mvp-rise"
      /* a tap anywhere on the card counts as opening the win (the X and the link handle their
         own clicks); nothing about how the card looks changes */
      onClick={markOpen}
      style={{
        position: 'relative', borderRadius: 18, padding: '18px 18px 17px', marginBottom: 12, minHeight: 176, boxSizing: 'border-box',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }} aria-label="Hide this"
        style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 99, border: 'none', background: '#f1f1f4', color: '#8e8e93', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
      >
        <X size={13} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: labelColor, marginBottom: 8 }}>
        <Glyph size={13} color={dotColor} strokeWidth={2.4} />
        {card.label.replace(/^Example · /i, '')}
        {/^example/i.test(card.id) && (
          <span style={{ marginLeft: 4, fontSize: 9, letterSpacing: '.08em', border: '1px solid #d8d8dc', color: '#8e8e93', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>Example</span>
        )}
      </div>
      {(() => {
        const v = card.visual
        const isPost = v?.kind === 'post'
        const thumb = isPost ? (typeof v.thumbnailUrl === 'string' ? v.thumbnailUrl : null) : null
        const link = isPost && typeof v.permalink === 'string' ? v.permalink : null
        const words = (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: headsUp ? '#1d1d1f' : '#0f6e56', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {card.big}
            </div>
            {/* a post says its counts as marks, not a sentence; every other card keeps its line */}
            {isPost ? <PostCounts v={v} /> : <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 5, lineHeight: 1.45 }}>{card.context}</div>}
          </>
        )
        if (!isPost) return <>{words}<Visual v={v} /></>
        /* THE POST ITSELF, beside its number (owner 2026-09-12): the picture, the network on its
           corner, a play mark on a video, and the way out to the post on a tap. */
        const pic = (
          <span style={{ position: 'relative', width: 78, height: 104, borderRadius: 14, flexShrink: 0, overflow: 'hidden', background: thumb ? `#111 center/cover url(${thumb})` : '#f0f0f3', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
            {!thumb && <ImageIcon size={20} color="#aeaeb2" />}
            {v.video === true && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 30, height: 30, borderRadius: 99, background: 'rgba(255,255,255,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 }}><Play size={13} fill="#1d1d1f" color="#1d1d1f" /></span></span>}
            <span style={{ position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={String(v.platform ?? '')} size={12} /></span>
          </span>
        )
        return (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{words}</div>
            {link ? <a href={link} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} aria-label="Open the post">{pic}</a> : pic}
          </div>
        )
      })()}
      {card.spark && card.spark.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, marginTop: 10 }} aria-hidden>
          {card.spark.map((v, i) => (
            <span key={i} style={{
              flex: 1, height: `${Math.max(8, Math.round((v / max) * 100))}%`, borderRadius: '2px 2px 0 0',
              background: i === card.spark!.length - 1 ? '#4abd98' : '#e6f4ee',
            }} />
          ))}
        </div>
      )}
      {card.attribution && (
        <div style={{ fontSize: 11.5, color: '#8e8e93', marginTop: 9 }}>
          {card.attribution}
        </div>
      )}
      {/* one row, so a win with both a move and a share link does not grow a second stack */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {card.cta ? (
          <a
            href={card.cta.href}
            onClick={markOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, textDecoration: 'none' }}
          >
            {card.cta.label} <ChevronRight size={13} />
          </a>
        ) : onSee && (
          <button
            onClick={(e) => { e.stopPropagation(); markOpen(); onSee() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            See the week <ChevronRight size={13} />
          </button>
        )}
        {card.share && (
          <a
            href={card.share.href}
            onClick={markOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, textDecoration: 'none' }}
          >
            {card.share.label} <ChevronRight size={13} />
          </a>
        )}
      </div>
    </div>
  )
}

/* ── the drawings each kind of card carries (2026-09-12) ─────────────────────────────────── */
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0)
const pair = (x: unknown): { cur: number; prior: number | null } => {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  return { cur: num(o.cur), prior: o.prior == null ? null : num(o.prior) }
}

/** one number against the same number before it: up green, down red, the difference beside */
function Tile({ Icon, label, cur, prior }: { Icon: typeof Phone; label: string; cur: number; prior: number | null }) {
  const d = prior == null ? null : cur - prior
  const ink = d == null || d === 0 ? '#8e8e93' : d > 0 ? '#17ad6b' : '#ec1528'
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#f5f5f7', borderRadius: 13, padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: '#6e6e73' }}><Icon size={12} /> {label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <b style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: '#1d1d1f', fontVariantNumeric: 'tabular-nums' }}>{cur.toLocaleString('en-US')}</b>
        {d != null && <span style={{ fontSize: 11, fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>{d > 0 ? '▲' : d < 0 ? '▼' : '–'} {Math.abs(d).toLocaleString('en-US')}</span>}
      </div>
    </div>
  )
}

/** a post's counts as marks: likes, shares, saves, comments, only the ones that happened */
function PostCounts({ v }: { v: Record<string, unknown> }) {
  const items = [
    { Icon: Heart, n: num(v.likes) }, { Icon: Share2, n: num(v.shares) }, { Icon: Bookmark, n: num(v.saves) }, { Icon: MessageCircle, n: num(v.comments) },
  ].filter((x) => x.n > 0)
  if (!items.length) return <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 5 }}>More than your usual post.</div>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
      {items.map((x, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums' }}><x.Icon size={13} color="#6e6e73" /> {x.n.toLocaleString('en-US')}</span>)}
    </div>
  )
}

function Visual({ v }: { v?: Record<string, unknown> }) {
  if (!v) return null
  const kind = String(v.kind ?? '')
  if (kind === 'gbp_week') {
    const c = pair(v.calls), d = pair(v.directions)
    return <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Tile Icon={Phone} label="Calls" cur={c.cur} prior={c.prior} /><Tile Icon={Navigation} label="Direction taps" cur={d.cur} prior={d.prior} /></div>
  }
  if (kind === 'site_week') {
    const vis = pair(v.visitors)
    return <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Tile Icon={Users} label="Visitors" cur={vis.cur} prior={vis.prior} />{num(v.menu) > 0 && <Tile Icon={Eye} label="Saw the menu" cur={num(v.menu)} prior={null} />}</div>
  }
  if (kind === 'reviews') {
    const avg = num(v.avg), full = Math.floor(avg), half = avg - full >= 0.5
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={18} color="#e0a13a" fill="#e0a13a" fillOpacity={i < full ? 1 : i === full && half ? 0.5 : 0.12} strokeWidth={1.6} />)}
          <b style={{ marginLeft: 6, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: '#1d1d1f' }}>{avg.toFixed(1)}</b>
        </span>
        <Tile Icon={MessageCircle} label="New reviews" cur={num(v.count)} prior={v.prior == null ? null : num(v.prior)} />
      </div>
    )
  }
  if (kind === 'social_month') {
    const nets = Array.isArray(v.nets) ? (v.nets as unknown[]).map(String) : []
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Tile Icon={Users} label="New followers" cur={num(v.gained)} prior={v.prior == null ? null : num(v.prior)} />
        {num(v.reach) > 0 && <Tile Icon={Eye} label="People reached" cur={num(v.reach)} prior={null} />}
        {nets.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{nets.slice(0, 4).map((n, i) => <span key={n} style={{ marginLeft: i ? -6 : 0, width: 24, height: 24, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BrandOrMark provider={n} size={13} /></span>)}</span>}
      </div>
    )
  }
  if (kind === 'campaign_moved') {
    const before = num(v.before), after = num(v.after)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1, background: '#f5f5f7', borderRadius: 13, padding: '9px 11px' }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#6e6e73' }}>Two weeks before</div><b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: '#6e6e73', marginTop: 2 }}>{before.toLocaleString('en-US')}</b></div>
        <ArrowRight size={16} color="#8e8e93" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, background: '#eaf7f3', borderRadius: 13, padding: '9px 11px' }}><div style={{ fontSize: 10.5, fontWeight: 600, color: '#2e9a78' }}>Two weeks after</div><b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: '#0f6e56', marginTop: 2 }}>{after.toLocaleString('en-US')}</b></div>
      </div>
    )
  }
  return null
}
