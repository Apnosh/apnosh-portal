'use client'

/**
 * Advanced analytics — a deeper read on each home metric.
 *
 * Where the home hero shows one line and four summary cards, this view
 * answers "where did the number come from, and how is it moving":
 *   1. Source breakdown over time  — stacked bars, one colour per source
 *   2. Per-source deep cards        — value, share of total, trend vs last
 *   3. Period comparison            — this period vs the last, per source
 *
 * Driven by AdvMetric[] (per-source daily series). The dev preview feeds
 * mock data; production will feed the same shape from getAdvancedMetrics().
 */

import { useMemo, useState } from 'react'

export type AdvRange = 'week' | 'month' | 'year'

export interface AdvSource {
  key: string
  label: string
  icon: string
  /** per sub-period values; null = beyond the data frontier (future) */
  vals: (number | null)[]
  /** same-length series for the prior period (for comparison) */
  prev: (number | null)[]
  /** false = platform exists for this metric but isn't connected yet.
      Shows "—" + "Not connected"; contributes nothing to totals/stacks. */
  connected?: boolean
  /** this source's total per trailing period (oldest → newest, last entry =
      current period), summed across the period. Powers the home-style trend
      line beneath the bars. null = period older than the data frontier. */
  trendVals?: (number | null)[]
}

export interface AdvPeriod {
  cap: string
  /** axis tick labels, one per sub-period */
  ticks: string[]
  sources: AdvSource[]
  /** one label per trailing trend period (aligns with source.trendVals) */
  trendTicks?: string[]
  /** rating metrics only: average score this period / last period */
  rating?: number
  ratingPrev?: number
}

export interface AdvMetric {
  key: string
  label: string
  sub: string
  /** 'count' (default) stacks summable sources; 'rating' shows an average
      score headline + a comparison of review counts by source, no stacks */
  kind?: 'count' | 'rating'
  week: AdvPeriod
  month: AdvPeriod
  year: AdvPeriod
}

/* Cohesive cool palette — greens into teal into periwinkle so stacked
   layers stay on-brand but remain distinguishable. Index by source slot. */
const PALETTE = ['#2e9a78', '#4abd98', '#6fbecb', '#9aa7d6', '#c3b1e1']

const RANGES: AdvRange[] = ['week', 'month', 'year']
const RANGE_LABEL: Record<AdvRange, string> = { week: 'Week', month: 'Month', year: 'Year' }

const ICONS: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.26a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
  cursor: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1.1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/>',
  save: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  tiktok: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
}

function Icon({ name, size = 16, sw = 1.9, className }: { name: string; size?: number; sw?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }} />
  )
}

const sum = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0)
const fmt = (n: number) => Math.round(n).toLocaleString()
const fmtCompact = (n: number) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(n).toLocaleString())

/* Catmull-Rom smoothing — same curve the home hero uses for its trend line. */
function smooth(pts: { x: number; y: number }[]): string {
  if (!pts.length) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  const t = 0.18
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t
    const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

export function AdvancedAnalytics({ metrics }: { metrics: AdvMetric[] }) {
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? '')
  const [range, setRange] = useState<AdvRange>('week')
  const [menuOpen, setMenuOpen] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0]
  const period = metric?.[range]

  const view = useMemo(() => {
    if (!period) return null
    const sources = period.sources
    const nCols = sources[0]?.vals.length ?? 0
    const isConn = (s: AdvSource) => s.connected !== false

    // colour slots go to connected sources in order; unconnected stay grey
    const colorByKey = new Map<string, string>()
    let slot = 0
    for (const s of sources) {
      if (isConn(s)) { colorByKey.set(s.key, PALETTE[slot % PALETTE.length]); slot++ }
      else colorByKey.set(s.key, '#c7c7cc')
    }

    // only connected, un-hidden sources feed the chart + totals
    const active = sources.filter(s => isConn(s) && !hidden.has(s.key))

    const colTotals: (number | null)[] = []
    for (let i = 0; i < nCols; i++) {
      let any = false, t = 0
      for (const s of active) { const v = s.vals[i]; if (v != null) { any = true; t += v } }
      colTotals.push(any ? t : null)
    }
    const max = Math.max(1, ...colTotals.map(v => v ?? 0))

    // Trailing period-over-period totals (blended across active sources) for
    // the home-style mini trend line beneath the bars.
    const trendLen = sources.find(s => s.trendVals)?.trendVals?.length ?? 0
    const trendTotals: (number | null)[] = []
    for (let i = 0; i < trendLen; i++) {
      let any = false, t = 0
      for (const s of active) { const v = s.trendVals?.[i]; if (v != null) { any = true; t += v } }
      trendTotals.push(any ? t : null)
    }

    const grandTotal = active.reduce((s, src) => s + sum(src.vals), 0)
    const prevGrand = active.reduce((s, src) => s + sum(src.prev), 0)

    const cards = sources.map((s) => {
      const connected = isConn(s)
      const total = connected ? sum(s.vals) : 0
      const prev = connected ? sum(s.prev) : 0
      const share = connected && grandTotal > 0 && !hidden.has(s.key) ? Math.round((total / grandTotal) * 100) : 0
      const delta = total - prev
      return { ...s, connected, color: colorByKey.get(s.key) ?? '#c7c7cc', total, prev, share, delta }
    })

    const connectedCount = sources.filter(isConn).length
    return { sources, active, nCols, colTotals, max, trendTotals, trendTicks: period.trendTicks ?? [], grandTotal, prevGrand, cards, connectedCount }
  }, [period, hidden])

  // Mini trend line geometry — totals across past periods, smoothed, with a
  // dashed average reference and a dot per period (last = current). Mirrors
  // the home hero's small trend graph.
  const mini = useMemo(() => {
    if (!view) return null
    const vals = view.trendTotals
    const pts: { i: number; v: number }[] = []
    vals.forEach((v, i) => { if (v != null) pts.push({ i, v }) })
    if (pts.length < 2) return null
    const nums = pts.map(p => p.v)
    const min = Math.min(...nums), max = Math.max(...nums), rg = Math.max(max - min, 0.0001)
    const n = vals.length, Wm = 100, Hm = 40, pd = 5
    const P = pts.map(p => ({
      x: n === 1 ? Wm / 2 : (p.i * Wm) / (n - 1),
      y: pd + (Hm - 2 * pd) - ((p.v - min) / rg) * (Hm - 2 * pd),
      i: p.i,
    }))
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length
    const by = pd + (Hm - 2 * pd) - ((avg - min) / rg) * (Hm - 2 * pd)
    return { P, d: smooth(P), by, Hm, lastI: pts[pts.length - 1].i }
  }, [view])

  if (!metric || !period || !view) {
    return <div className="adv"><div className="adv-empty">No data yet</div></div>
  }

  // Sparse axis labels under the trend line (≤4 evenly spaced).
  const mticks = (() => {
    const t = view.trendTicks, n = t.length
    if (!n) return [] as { l: string; x: number; first: boolean; last: boolean }[]
    const c = n <= 6 ? n : 4
    const out: { l: string; x: number; first: boolean; last: boolean }[] = []
    for (let k = 0; k < c; k++) {
      const x = c === 1 ? 50 : (k * 100) / (c - 1)
      const i = Math.round((k * (n - 1)) / (c - 1))
      out.push({ l: t[i], x, first: k === 0, last: k === c - 1 })
    }
    return out
  })()

  const toggle = (k: string) => setHidden(prev => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else if (next.size < view.connectedCount - 1) next.add(k)
    return next
  })

  const grandDelta = view.grandTotal - view.prevGrand
  const grandDir = grandDelta >= 0 ? 'up' : 'down'
  const cmpMax = Math.max(1, ...view.cards.map(c => Math.max(c.total, c.prev)))
  const segIdx = RANGES.indexOf(range)

  // Last column that has settled data — gets the solid "current" bar accent,
  // same live cue the home hero uses.
  const lastColIdx = (() => { let li = -1; view.colTotals.forEach((v, i) => { if (v != null) li = i }); return li })()

  // rating metrics (e.g. Reputation): average score headline, no stacks/share
  const isRating = metric.kind === 'rating'
  const ratingNow = period.rating ?? 0
  const ratingDelta = Math.round(((period.rating ?? 0) - (period.ratingPrev ?? 0)) * 10) / 10
  const ratingDir = ratingDelta >= 0 ? 'up' : 'down'

  return (
    <div className="adv">
      {/* Header: metric switcher + range */}
      <div className="adv-top">
        <div className="adv-sel">
          <button className="adv-selbtn" type="button" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
            <span className="adv-eyebrow">{metric.label}</span>
            <Icon name="chevDown" size={14} sw={2.6} className="adv-chev" />
          </button>
          {menuOpen && (
            <div className="adv-menu">
              {metrics.map(m => (
                <button key={m.key} type="button" className={m.key === metricKey ? 'on' : ''}
                  onClick={() => { setMetricKey(m.key); setRange('week'); setHidden(new Set()); setMenuOpen(false) }}>{m.label}</button>
              ))}
            </div>
          )}
          <p className="adv-sub">{metric.sub}</p>
        </div>
        <div className="adv-seg">
          <div className="adv-seg-ind" style={{ transform: `translateX(${segIdx * 100}%)` }} />
          {RANGES.map(r => (
            <button key={r} type="button" className={'adv-seg-btn' + (r === range ? ' on' : '')} onClick={() => { setRange(r); setHidden(new Set()) }}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
      </div>

      {/* Headline total + trend */}
      <div className="adv-headline">
        <div>
          {isRating ? (
            <p className="adv-total">{ratingNow > 0 ? <>{ratingNow.toFixed(1)}<span className="adv-total-star">★</span></> : '—'}</p>
          ) : (
            <p className="adv-total">{view.connectedCount === 0 ? '—' : fmt(view.grandTotal)}</p>
          )}
          <p className="adv-cap">{period.cap}</p>
        </div>
        {isRating ? (
          ratingNow > 0 && ratingDelta !== 0 && (
            <div className={`adv-trend ${ratingDir}`}>
              <Icon name={ratingDir === 'up' ? 'arrowUp' : 'arrowDown'} size={13} sw={2.4} />
              <span>{ratingDelta > 0 ? '+' : '−'}{Math.abs(ratingDelta).toFixed(1)}</span>
              <span className="adv-trend-l">vs last {range}</span>
            </div>
          )
        ) : (
          Math.round(grandDelta) !== 0 && (
            <div className={`adv-trend ${grandDir}`}>
              <Icon name={grandDir === 'up' ? 'arrowUp' : 'arrowDown'} size={13} sw={2.4} />
              <span>{fmt(Math.abs(grandDelta))}</span>
              <span className="adv-trend-l">vs last {range}</span>
            </div>
          )
        )}
      </div>

      {/* 1 + 2 — stacked bars and per-source share cards apply only to
          summable (count) metrics. Rating metrics skip straight to compare. */}
      {!isRating && <>

      {/* 1. Over time — this period's total per sub-period as bars, last
          settled bar accented live. Same chart as the home hero. */}
      <div className="adv-card">
        <div className="adv-card-h">
          <span className="adv-card-t">Over time</span>
          <span className="adv-card-s">this {range}</span>
        </div>
        <div className="adv-plot">
          <div className="adv-bars">
            {view.colTotals.map((ct, i) => {
              if (ct == null) return <div key={i} className="adv-bar blank" />
              const h = Math.max(2, (ct / view.max) * 100)
              return <div key={i} className={'adv-bar' + (i === lastColIdx ? ' last' : '')}
                style={{ height: `${h.toFixed(1)}%`, animationDelay: `${(i * 0.03).toFixed(2)}s` }} />
            })}
          </div>
        </div>
        <div className="adv-xrow">
          {period.ticks.map((t, i) => <span key={i} className="adv-xl">{t}</span>)}
        </div>
        {/* Trend line — metric total across past periods (last = current),
            with a dashed average reference. Same graph as the home hero. */}
        {mini && (
          <>
            <div className="adv-mticks">
              {mticks.map((t, i) => (
                <span key={i} className={'adv-mtick' + (t.first ? ' first' : '') + (t.last ? ' last' : '')}
                  style={{ left: `${t.x.toFixed(1)}%` }}>{t.l}</span>
              ))}
            </div>
            <div className="adv-mini">
              <svg className="adv-mini-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path d={`M0 ${mini.by.toFixed(1)} L100 ${mini.by.toFixed(1)}`} stroke="var(--ink-4)" strokeWidth={1}
                  strokeDasharray="2 3" fill="none" vectorEffect="non-scaling-stroke" />
                <path d={mini.d} stroke="var(--brand-d)" strokeWidth={2} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="adv-mdots">
                {mini.P.map((p, i) => (
                  <span key={i} className={'adv-mdot' + (p.i === mini.lastI ? ' last' : '')}
                    style={{ left: `${p.x.toFixed(1)}%`, top: `${((p.y / mini.Hm) * 100).toFixed(1)}%` }} />
                ))}
              </div>
            </div>
          </>
        )}
        {/* Source filter — tap to add/remove a platform from the totals above */}
        {view.connectedCount > 1 && (
          <div className="adv-legend">
            {view.cards.filter(c => c.connected).map((c) => (
              <button key={c.key} type="button" className={'adv-leg' + (hidden.has(c.key) ? ' off' : '')} onClick={() => toggle(c.key)}>
                <span className="adv-leg-dot" style={{ background: c.color }} />
                <span className="adv-leg-l">{c.label}</span>
                <span className="adv-leg-v">{fmtCompact(c.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Per-source deep cards */}
      <div className="adv-card-h adv-section-h">
        <span className="adv-card-t">By source</span>
        <span className="adv-card-s">share &amp; trend</span>
      </div>
      <div className="adv-grid">
        {view.cards.map((c) => {
          const dir = c.delta >= 0 ? 'up' : 'down'
          if (!c.connected) {
            return (
              <div key={c.key} className="adv-srccard off">
                <div className="adv-srccard-top">
                  <span className="adv-srccard-ic"><Icon name={c.icon} size={15} sw={1.9} /></span>
                  <span className="adv-srccard-l">{c.label}</span>
                </div>
                <p className="adv-srccard-v">—</p>
                <div className="adv-srccard-foot">
                  <span className="adv-srccard-off">Not connected</span>
                </div>
              </div>
            )
          }
          return (
            <div key={c.key} className="adv-srccard">
              <div className="adv-srccard-top">
                <span className="adv-srccard-ic" style={{ color: c.color }}><Icon name={c.icon} size={15} sw={1.9} /></span>
                <span className="adv-srccard-l">{c.label}</span>
              </div>
              <p className="adv-srccard-v">{fmt(c.total)}</p>
              <div className="adv-srccard-foot">
                <span className="adv-share"><span className="adv-share-bar" style={{ width: `${c.share}%`, background: c.color }} />{c.share}%</span>
                {Math.round(c.delta) !== 0 && (
                  <span className={`adv-d ${dir}`}><Icon name={dir === 'up' ? 'arrowUp' : 'arrowDown'} size={10} sw={2.4} />{fmt(Math.abs(c.delta))}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      </>}

      {/* 3. Period comparison — this vs last, per source */}
      <div className="adv-card-h adv-section-h">
        <span className="adv-card-t">{isRating ? 'Reviews by source' : `This ${range} vs last ${range}`}</span>
        {isRating && <span className="adv-card-s">this {range} vs last {range}</span>}
      </div>
      <div className="adv-card">
        <div className="adv-cmp-key">
          <span><span className="adv-cmp-dot now" />This {range}</span>
          <span><span className="adv-cmp-dot prev" />Last {range}</span>
        </div>
        {view.cards.map((c) => (
          c.connected ? (
            <div key={c.key} className="adv-cmp-row">
              <span className="adv-cmp-l">{c.label}</span>
              <div className="adv-cmp-bars">
                <div className="adv-cmp-track"><div className="adv-cmp-bar now" style={{ width: `${(c.total / cmpMax) * 100}%` }} /></div>
                <div className="adv-cmp-track"><div className="adv-cmp-bar prev" style={{ width: `${(c.prev / cmpMax) * 100}%` }} /></div>
              </div>
              <span className="adv-cmp-v">{fmt(c.total)}<span className="adv-cmp-prev">{fmt(c.prev)}</span></span>
            </div>
          ) : (
            <div key={c.key} className="adv-cmp-row off">
              <span className="adv-cmp-l">{c.label}</span>
              <span className="adv-cmp-off">Not connected</span>
              <span className="adv-cmp-v">—</span>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
