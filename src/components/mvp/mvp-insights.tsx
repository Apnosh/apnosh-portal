'use client'

/**
 * MVP Insights — the owner's "See all insights" deep-dive, reached from the
 * home chart. Stays in the apnosh-mvp app design (full-screen phone frame,
 * brand green, Cal Sans display) and reuses the home's chart + breakdown tiles
 * so the two surfaces feel like one app.
 *
 * Advanced detail the home doesn't have:
 *   - the customer-journey funnel (Reach -> Customers -> Bookings -> Email)
 *   - per-metric deep dive: every metric, full chart with 7d/30d/1y/custom
 *     ranges, and the source breakdown
 *   - reputation: rating, volume, and the latest reviews (tap to reply)
 *   - grounded highlights (biggest mover, where you stand)
 *
 * Presentation only; all numbers are passed in already-transformed (the page
 * sources them from /api/dashboard/load, the same endpoint the home uses).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Star,
  Eye, MousePointerClick, CalendarDays, Mail, BarChart3,
} from 'lucide-react'
import { ActionsChart, SourceCard, useChartRange, isFresh, relDate, type MetricView } from './mvp-home'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  amber: '#f5a623', coral: '#a85c3c', coralBg: '#f8efe9',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface InsightsReview {
  id: string; authorName: string; rating: number; text: string | null
  source: string; postedAt: string; replied: boolean; needsReply: boolean
}
export interface InsightsData {
  businessName: string
  metrics: MetricView[]
  reviews: InsightsReview[]
  avgRating: number | null
  totalReviews: number
  unanswered: number
}

// "What customers are saying" — sentiment split (rating-derived) + an AI theme
// summary. Lazy-fetched from /api/dashboard/review-summary when Reviews is opened.
interface ReviewSummary {
  split: { positive: number; neutral: number; negative: number; total: number; withText: number }
  summary: string | null
  loved: string[]
  improve: string[]
  source: string
}

// Short icon per metric key, for the snapshot + the metric switcher.
const METRIC_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  reach: Eye, interactions: MousePointerClick, bookings: CalendarDays, loyalty: Mail, reputation: Star,
}
// The volume metrics shown in the "at a glance" snapshot (reputation is a rate,
// handled separately). Rendered sorted by size, NOT as a strict funnel: these
// counts come from different sources and don't nest, so we never imply a
// stage-to-stage conversion.
const SNAPSHOT_KEYS = ['reach', 'interactions', 'bookings', 'loyalty']

// Hide the native scrollbar on the horizontally-scrolling metric pills, matching
// the home (.mvp-swipe) and review-detail surfaces.
const INSIGHTS_CSS = '.mvp-insights-pills{scrollbar-width:none;-ms-overflow-style:none}.mvp-insights-pills::-webkit-scrollbar{display:none}'

export default function MvpInsights({ data, loading, error, clientId }: { data: InsightsData | null; loading: boolean; error: string | null; clientId?: string }) {
  const router = useRouter()
  const [sel, setSel] = useState(0)
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const clampedSel = data ? Math.min(sel, Math.max(0, data.metrics.length - 1)) : 0

  // Prefetch the review sentiment + theme summary once the client is known, so
  // the Reviews tab is instant. Keyed on the client id ONLY — never on its own
  // loading/result state — so it can't self-trigger a loop or get stuck if the
  // user navigates mid-flight.
  useEffect(() => {
    if (!clientId) return
    let live = true
    setSummary(null)
    setSummaryLoading(true)
    fetch(`/api/dashboard/review-summary?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setSummary(j) })
      .catch(() => { /* leave the section quiet on failure */ })
      .finally(() => { if (live) setSummaryLoading(false) })
    return () => { live = false }
  }, [clientId])

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <style>{INSIGHTS_CSS}</style>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      {/* sticky back header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 6px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
        <button onClick={back} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 99, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><ChevronLeft size={24} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.1 }}>Insights</div>
          {data?.businessName && <div style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.businessName}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <Centered>Loading your numbers&hellip;</Centered>
        ) : error ? (
          <Centered>Couldn&apos;t load: {error}</Centered>
        ) : !data || data.metrics.length === 0 ? (
          <EmptyState />
        ) : (
          <Body data={data} sel={clampedSel} setSel={setSel} summary={summary} summaryLoading={summaryLoading} />
        )}
      </div>
      </div>
    </div>
  )
}

function Body({ data, sel, setSel, summary, summaryLoading }: { data: InsightsData; sel: number; setSel: (i: number) => void; summary: ReviewSummary | null; summaryLoading: boolean }) {
  const metrics = data.metrics
  const byKey = new Map(metrics.map((m) => [m.key, m]))
  // Magnitude snapshot, sorted biggest to smallest so the bars always read
  // cleanly (no inverted "funnel"). These are independent counts, not stages.
  const snapshot = SNAPSHOT_KEYS.map((k) => byKey.get(k)).filter((m): m is MetricView => !!m && m.total > 0).sort((a, b) => b.total - a.total)
  const snapMax = Math.max(1, ...snapshot.map((m) => m.total))
  const reach = byKey.get('reach')
  const mv = metrics[sel]

  // Biggest mover this week (by absolute weekly change), for the highlight line.
  const mover = [...metrics].filter((m) => m.total > 0 && m.weekPct !== 0).sort((a, b) => Math.abs(b.weekPct) - Math.abs(a.weekPct))[0]

  // Selected metric's chart shares its range with the hero, so the range chips
  // move the headline number + delta (not just the bars); the delta goes honest
  // ("Updated <when>") when the data is too stale to claim a current trend.
  const rc = useChartRange(mv)
  const fresh = isFresh(mv?.lastDataDate ?? '', rc.summary.periodDays)
  const dn = rc.summary.deltaPct < 0

  return (
    <div style={{ padding: '4px 18px 40px' }}>

      {/* ── Highlights ── */}
      <Section title="Where you stand">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mover && (
            <Highlight
              tone={mover.weekPct > 0 ? 'up' : 'down'}
              text={<><b style={{ color: C.ink, fontWeight: 600 }}>{mover.tabLabel}</b> {mover.weekPct > 0 ? 'is up' : 'is down'} {Math.abs(mover.weekPct)}% this week{mover.prevMonthLabel ? `, ${mover.monthPct > 0 ? 'up' : mover.monthPct < 0 ? 'down' : 'even'} ${mover.monthPct !== 0 ? Math.abs(mover.monthPct) + '% ' : ''}vs ${mover.prevMonthLabel}` : ''}.</>}
            />
          )}
          {data.avgRating != null && (
            <Highlight
              tone="star"
              text={<>You&apos;re at <b style={{ color: C.ink, fontWeight: 600 }}>{data.avgRating.toFixed(1)}★</b> across {data.totalReviews.toLocaleString()} review{data.totalReviews === 1 ? '' : 's'}{data.unanswered > 0 ? `, with ${data.unanswered} waiting for a reply` : ''}.</>}
            />
          )}
          {reach && reach.total > 0 && (
            <Highlight
              tone="info"
              text={<><b style={{ color: C.ink, fontWeight: 600 }}>{reach.total.toLocaleString()}</b> {reach.heroSub || 'people saw you'} this week.</>}
            />
          )}
        </div>
      </Section>

      {/* ── This week at a glance (magnitude snapshot, sorted) ── */}
      {snapshot.length > 1 && (
        <Section title="This week at a glance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {snapshot.map((m) => {
              const Icon = METRIC_ICON[m.key] ?? Eye
              const w = Math.max(14, Math.round((m.total / snapMax) * 100))
              const dn = m.weekPct < 0
              return (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} color={C.greenDk} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, color: C.mute, fontWeight: 500 }}>{m.tabLabel}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600 }}>{m.total.toLocaleString()}</span>
                        {m.weekPct !== 0 && <span style={{ fontSize: 11, fontWeight: 600, color: dn ? C.coral : C.greenDk }}>{dn ? '▼' : '▲'}{Math.abs(m.weekPct)}%</span>}
                      </span>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: C.bg, overflow: 'hidden' }}>
                      <div style={{ width: `${w}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.green}, ${C.greenDk})` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>Your channels by volume this week. Bars are scaled to your biggest.</div>
        </Section>
      )}

      {/* ── Per-metric deep dive ── */}
      <Section title="By the numbers">
        {/* metric switcher */}
        <div className="mvp-insights-pills" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          {metrics.map((m, i) => {
            const on = i === sel
            const Icon = METRIC_ICON[m.key] ?? BarChart3
            return (
              <button key={m.key} onClick={() => setSel(i)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff', color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Icon size={14} color={on ? C.greenDk : C.faint} />{m.tabLabel}
              </button>
            )
          })}
        </div>

        {/* selected metric */}
        <div style={{ fontSize: 14, color: C.mute, fontWeight: 500 }}>{mv.heroLabel}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 11, marginTop: 2 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em' }}>{rc.summary.total ? rc.summary.total.toLocaleString() : '—'}</span>
          {rc.summary.total > 0 && fresh && rc.summary.deltaPct !== 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: dn ? C.coral : C.greenDk, background: dn ? C.coralBg : C.greenSoft, padding: '4px 11px', borderRadius: 99, marginBottom: 5 }}>
              <span style={{ fontSize: 10 }}>{dn ? '▼' : '▲'}</span>{Math.abs(rc.summary.deltaPct)}% {rc.summary.cmpFrame}
            </span>
          )}
          {rc.summary.total > 0 && !fresh && mv.lastDataDate && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.mute, background: C.bg, padding: '4px 11px', borderRadius: 99, marginBottom: 5 }}>
              Updated {relDate(mv.lastDataDate)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13.5, color: C.faint, marginTop: 5 }}>{mv.heroSub}</div>
        {fresh && rc.summary.yoyPct != null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 600, color: rc.summary.yoyPct > 0 ? C.greenDk : rc.summary.yoyPct < 0 ? C.coral : C.mute }}>
            {rc.summary.yoyPct > 0 ? <TrendingUp size={14} /> : rc.summary.yoyPct < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {rc.summary.yoyPct > 0 ? `Up ${rc.summary.yoyPct}% ${rc.summary.yoyLabel}` : rc.summary.yoyPct < 0 ? `Down ${Math.abs(rc.summary.yoyPct)}% ${rc.summary.yoyLabel}` : `Even with last year`}
          </div>
        )}

        {/* full chart with range chips (reused from the home) */}
        <ActionsChart range={rc.range} setRange={rc.setRange} cStart={rc.cStart} setCStart={rc.setCStart} cEnd={rc.cEnd} setCEnd={rc.setCEnd} summary={rc.summary} noun={mv.unit} />

        {/* what feeds this metric */}
        {mv.tiles.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '16px 0 9px' }}>What feeds this</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, mv.tiles.length)},1fr)`, gap: 8 }}>
              {mv.tiles.slice(0, 4).map((s) => <SourceCard key={s.key + s.label} s={s} />)}
            </div>
          </>
        )}
      </Section>

      {/* ── What customers are saying (Reviews tab only) ── */}
      {mv.key === 'reputation' && <ReviewSentiment summary={summary} loading={summaryLoading} />}

      {/* ── Recent reviews ── */}
      {data.reviews.length > 0 && (
        <Section title="Latest reviews" action={{ label: 'See all', href: '/dashboard/inbox?tab=reviews' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.reviews.slice(0, 3).map((r) => (
              <Link key={r.id} href={`/dashboard/reviews/${r.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.authorName}</span>
                  <Stars n={r.rating} />
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {r.needsReply && <span style={{ fontSize: 10, fontWeight: 700, color: C.coral, background: C.coralBg, borderRadius: 99, padding: '2px 8px' }}>Reply</span>}
                    <ChevronRight size={15} color={C.faint} />
                  </span>
                </div>
                {r.text && <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</div>}
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: C.faint }}>{sub}</span>}
        {action && <Link href={action.href} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>{action.label} <ChevronRight size={13} /></Link>}
      </div>
      {children}
    </div>
  )
}

function Highlight({ tone, text }: { tone: 'up' | 'down' | 'star' | 'info'; text: React.ReactNode }) {
  const dot = tone === 'down' ? C.coral : tone === 'star' ? C.amber : C.green
  return (
    <div style={{ display: 'flex', gap: 10, background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '11px 13px' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, marginTop: 6, flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45 }}>{text}</div>
    </div>
  )
}

function ReviewSentiment({ summary, loading }: { summary: ReviewSummary | null; loading: boolean }) {
  if (!summary) {
    return (
      <Section title="What customers are saying">
        <div style={{ background: '#fbfcfb', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.faint }}>
          {loading ? 'Reading your reviews…' : 'We could not load your review summary just now. Check back in a bit.'}
        </div>
      </Section>
    )
  }
  const s = summary.split
  const total = s.total || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <Section title="What customers are saying">
      {/* positive / neutral / negative split, from the star ratings */}
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', background: C.bg }}>
        {s.positive > 0 && <div style={{ width: pct(s.positive), background: C.green }} />}
        {s.neutral > 0 && <div style={{ width: pct(s.neutral), background: C.faint }} />}
        {s.negative > 0 && <div style={{ width: pct(s.negative), background: C.coral }} />}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 11.5, flexWrap: 'wrap' }}>
        <Legend dot={C.green} label="Positive" n={s.positive} />
        <Legend dot={C.faint} label="Neutral" n={s.neutral} />
        <Legend dot={C.coral} label="Negative" n={s.negative} />
      </div>
      {s.total > 0 && <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Based on {s.total.toLocaleString()} rated review{s.total === 1 ? '' : 's'} you&apos;ve collected.</div>}

      {summary.summary && <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, marginTop: 14 }}>{summary.summary}</div>}

      {(summary.loved.length > 0 || summary.improve.length > 0) && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {summary.loved.length > 0 && <ThemeRow label="Loved" items={summary.loved} fg={C.greenDk} bg={C.greenSoft} />}
          {summary.improve.length > 0 && <ThemeRow label="Could improve" items={summary.improve} fg={C.coral} bg={C.coralBg} />}
        </div>
      )}

      {!summary.summary && (
        <div style={{ fontSize: 12, color: C.faint, marginTop: 12, lineHeight: 1.4 }}>A few more written reviews and we can pull out the themes guests mention.</div>
      )}
    </Section>
  )
}

function Legend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.mute }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />{label} <b style={{ color: C.ink, fontWeight: 600 }}>{n.toLocaleString()}</b>
    </span>
  )
}

function ThemeRow({ label, items, fg, bg }: { label: string; items: string[]; fg: string; bg: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((t, i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, color: fg, background: bg, borderRadius: 99, padding: '5px 11px' }}>{t}</span>)}
      </div>
    </div>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} color={C.amber} fill={i <= Math.round(n) ? C.amber : 'transparent'} />)}
    </span>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: C.mute, fontSize: 14 }}>{children}</div>
}

function EmptyState() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><BarChart3 size={24} color={C.greenDk} /></div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, marginBottom: 6 }}>Insights are on the way</div>
      <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.5, maxWidth: 280 }}>Once we start tracking your Google, social, and review activity, your numbers and trends show up here.</div>
    </div>
  )
}
