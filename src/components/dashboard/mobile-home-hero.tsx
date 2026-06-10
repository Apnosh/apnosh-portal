'use client'

/**
 * Mobile home hero — live React port of the approved preview.
 *
 * Renders the metric switcher, big number, period average + trend, the
 * Week/Month/Year bar chart (tap a bar to inspect a sub-period), the
 * timeline axis, the trend mini-graph (tap a dot to load a period) and
 * the per-period breakdown cards — all driven by getHomeMetrics().
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { HomeMetric, HomeInstance } from '@/lib/dashboard/get-home-metrics'

type Range = 'week' | 'month' | 'year'
const RANGES: Range[] = ['week', 'month', 'year']
const RANGE_LABEL: Record<Range, string> = { week: 'Week', month: 'Month', year: 'Year' }
const DOWL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MS = 86400000

const parse = (s: string) => new Date(s + 'T00:00:00')
const fmtD = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const ICONS: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.26a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
  cursor: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M4 12h11a4 4 0 0 1 4 4v2"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1.1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
}

function Icon({ name, className, sw = 1.9, size = 16 }: { name: string; className?: string; sw?: number; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }} />
  )
}

const fmtAvg = (a: number) => (a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString())

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

function capFor(c: Range, inst: HomeInstance, isCur: boolean, ago: number): string {
  const s = parse(inst.start)
  if (c === 'week') {
    const sat = new Date(s.getTime() + 6 * MS)
    return (isCur ? 'This week · ' : ago === 1 ? 'Last week · ' : '') + fmtD(s) + ' – ' + fmtD(sat)
  }
  if (c === 'month') {
    const end = new Date(s.getFullYear(), s.getMonth() + 1, 0)
    const pre = isCur ? 'This month · ' : ago === 1 ? 'Last month · ' : s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ' · '
    return pre + fmtD(s) + ' – ' + end.getDate()
  }
  const pre = isCur ? 'This year · ' : ago === 1 ? 'Last year · ' : s.getFullYear() + ' · '
  return pre + 'Jan – ' + (isCur ? new Date().toLocaleDateString('en-US', { month: 'short' }) : 'Dec')
}

function selSubLabel(sub: string, instStart: Date, selBar: number): string {
  if (sub === 'day') {
    const d = new Date(instStart.getTime() + selBar * MS)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }
  // month sub (year range)
  return new Date(instStart.getFullYear(), selBar, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function tickLabel(c: Range, inst: HomeInstance, idx: number): string {
  const s = parse(inst.start)
  if (c === 'week') return fmtD(s)
  if (c === 'month') {
    let l = s.toLocaleDateString('en-US', { month: 'short' })
    if (s.getMonth() === 0 || idx === 0) l += " '" + ('' + s.getFullYear()).slice(2)
    return l
  }
  return '' + s.getFullYear()
}

interface VM {
  insts: HomeInstance[]; idx: number; vals: (number | null)[]; fmt: 'num' | 'rate'; barFmt: 'num'
  sub: string; instStart: Date; isCur: boolean; headline: number; avg: number
  avgDelta: number | null; avgDir: 'up' | 'down'; miniVals: number[]; todayIdx: number
  cap: string; dayLabels: string[] | null; xmarks: { l: string; x: number }[] | null
  breakdown: HomeMetric['week'][number]['breakdown']
}

/* The most recent period that actually has settled data. Used as the
   default so the graph never lands on an empty, lagged current week
   (e.g. early in the week when every day is still beyond the data
   frontier). The user can still navigate to the current period. */
function lastWithDataIdx(insts: HomeInstance[]): number {
  for (let i = insts.length - 1; i >= 0; i--) {
    if (insts[i].vals.some(v => v != null)) return i
  }
  return insts.length - 1
}

function buildVM(metric: HomeMetric, cur: Range, instIdx: number | null): VM | null {
  const insts = metric[cur]
  if (!insts.length) return null
  const idx = instIdx == null || instIdx > insts.length - 1 || instIdx < 0 ? lastWithDataIdx(insts) : instIdx
  const inst = insts[idx]
  const isCur = idx === insts.length - 1
  const ago = insts.length - 1 - idx
  const vals = inst.vals
  let elapsed = 0, lastIdx = -1
  vals.forEach((v, i) => { if (v != null) { elapsed++; lastIdx = i } })
  const fmt = metric.fmt
  const headline = fmt === 'rate' ? inst.rating ?? 0 : inst.total
  const nn = vals.filter((v): v is number => v != null)
  const avg = nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : 0
  /* Trend vs the same-elapsed window of the prior period, shown as an
     absolute change (a number), not a percentage — a small swing on a
     low base reads far less dramatically this way. */
  let avgDelta: number | null = null, avgDir: 'up' | 'down' = 'up'
  if (idx > 0) {
    const pv = insts[idx - 1].vals; let ps = 0, pc = 0
    for (let q = 0; q < pv.length && pc < elapsed; q++) { const x = pv[q]; if (x != null) { ps += x; pc++ } }
    if (pc > 0) { const pAvg = ps / pc; const d = avg - pAvg; avgDir = d >= 0 ? 'up' : 'down'; avgDelta = Math.abs(d) }
  }
  const instStart = parse(inst.start)
  let dayLabels: string[] | null = null, xmarks: { l: string; x: number }[] | null = null
  if (cur === 'week') dayLabels = DOWL
  else if (cur === 'year') dayLabels = MONI
  else {
    const dim = vals.length, mc = 5, mk: { l: string; x: number }[] = []
    for (let w = 0; w < mc; w++) {
      const mx = (w * 100) / (mc - 1)
      const day = Math.round((w * (dim - 1)) / (mc - 1)) + 1
      mk.push({ l: fmtD(new Date(instStart.getFullYear(), instStart.getMonth(), day)), x: mx })
    }
    xmarks = mk
  }
  return {
    insts, idx, vals, fmt, barFmt: 'num', sub: inst.sub, instStart, isCur, headline, avg,
    avgDelta, avgDir, miniVals: insts.map(w => w.total), todayIdx: isCur ? lastIdx : -1,
    cap: capFor(cur, inst, isCur, ago), dayLabels, xmarks, breakdown: inst.breakdown,
  }
}

function useAnimatedNumber(target: number, fmt: 'num' | 'rate') {
  const [display, setDisplay] = useState(() => (fmt === 'rate' ? target.toFixed(1) + '★' : Math.round(target).toLocaleString()))
  const raf = useRef<number | null>(null)
  const dispRef = useRef(display)
  dispRef.current = display
  useEffect(() => {
    const startVal = parseFloat(dispRef.current.replace(/[^0-9.]/g, '')) || 0
    const fv = (v: number) => (fmt === 'rate' ? v.toFixed(1) + '★' : Math.round(v).toLocaleString())
    let t0: number | null = null
    const step = (ts: number) => {
      if (t0 == null) t0 = ts
      const p = Math.min(1, (ts - t0) / 700)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(fv(startVal + (target - startVal) * e))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, fmt])
  return display
}

export function MobileHomeHero({ metrics }: { metrics: HomeMetric[] }) {
  const usable = metrics.filter(m => m.week.length || m.month.length || m.year.length)
  const all = metrics.length ? metrics : []
  const firstKey = (usable[0] ?? all[0])?.key ?? 'customers'

  const [metricKey, setMetricKey] = useState(firstKey)
  const [cur, setCur] = useState<Range>('week')
  const [instIdx, setInstIdx] = useState<number | null>(null)
  const [selBar, setSelBar] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const metric = all.find(m => m.key === metricKey) ?? all[0]
  const vm = metric ? buildVM(metric, cur, instIdx) : null

  // Selected sub-period (only when it has a value)
  const sel = vm && selBar != null && selBar < vm.vals.length && vm.vals[selBar] != null ? selBar : null
  const headlineTarget = vm ? (sel != null ? (vm.vals[sel] as number) : vm.headline) : 0
  const headlineFmt: 'num' | 'rate' = vm ? (sel != null ? 'num' : vm.fmt) : 'num'
  const display = useAnimatedNumber(headlineTarget, headlineFmt)

  const setRange = (r: Range) => { setCur(r); setInstIdx(null); setSelBar(null) }
  const pickMetric = (k: HomeMetric['key']) => { setMetricKey(k); setCur('week'); setInstIdx(null); setSelBar(null); setMenuOpen(false) }
  const tapBar = (i: number) => { if (!vm || vm.vals[i] == null) return; setSelBar(p => (p === i ? null : i)) }
  const tapDot = (i: number) => { setInstIdx(i); setSelBar(null) }

  // close metric menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const h = () => setMenuOpen(false)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menuOpen])

  const subnote = vm && sel != null ? selSubLabel(vm.sub, vm.instStart, sel) : metric?.sub ?? ''

  // mini graph geometry
  const mini = useMemo(() => {
    if (!vm) return null
    const vals = vm.miniVals, n = vals.length
    const min = Math.min(...vals), max = Math.max(...vals), rg = Math.max(max - min, 0.0001)
    const Wm = 100, Hm = 40, pd = 5
    const pts = vals.map((v, i) => ({ x: n === 1 ? Wm / 2 : (i * Wm) / (n - 1), y: pd + (Hm - 2 * pd) - ((v - min) / rg) * (Hm - 2 * pd) }))
    const d = smooth(pts)
    const avg = vals.reduce((a, b) => a + b, 0) / (n || 1)
    const by = pd + (Hm - 2 * pd) - ((avg - min) / rg) * (Hm - 2 * pd)
    return { pts, d, area: d + ` L ${Wm} ${Hm} L 0 ${Hm} Z`, by, Hm }
  }, [vm])

  // bars max for scaling
  const barMax = useMemo(() => {
    if (!vm) return 1
    const nn = vm.vals.filter((v): v is number => v != null)
    const m = nn.length ? Math.max(...nn) : 1
    return m > 0 ? m : 1
  }, [vm])

  if (!metric) {
    return <div className="m-home"><div className="spot"><p className="t-eyebrow">Your dashboard</p><div className="nodata"><span className="nd-t">No data yet</span><span className="nd-s">Connect your channels to see your numbers here.</span></div></div></div>
  }

  const segIdx = RANGES.indexOf(cur)
  const mticks = vm ? (() => {
    const insts = vm.insts, n = insts.length, c = n <= 6 ? n : 4
    const out: { l: string; x: number; first: boolean; last: boolean }[] = []
    for (let k = 0; k < c; k++) {
      const x = c === 1 ? 50 : (k * 100) / (c - 1)
      const i = Math.round((k * (n - 1)) / (c - 1))
      out.push({ l: tickLabel(cur, insts[i], i), x, first: k === 0, last: k === c - 1 })
    }
    return out
  })() : []

  // Reliable-data signals (source lag): does the current period have any
  // settled data, and what's the latest day we trust?
  const hasReliable = vm ? vm.vals.some(v => v != null) : false
  const dataThrough = (() => {
    if (!vm || !vm.isCur || vm.sub !== 'day') return null
    let li = -1
    vm.vals.forEach((v, i) => { if (v != null) li = i })
    if (li < 0) return null
    const last = new Date(vm.instStart.getTime() + li * MS)
    const t0 = new Date(); t0.setHours(0, 0, 0, 0)
    return last.getTime() < t0.getTime() ? fmtD(last) : null
  })()

  return (
    <div className="m-home">
      <section className="spot">
        <Link className="bell" aria-label="Notifications" href="/dashboard/notifications">
          <Icon name="bell" sw={1.8} size={20} /><span className="dot" />
        </Link>

        <div className="metricsel">
          <button className="metric-btn" type="button" aria-expanded={menuOpen}
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}>
            <span className="t-eyebrow">{metric.label}</span>
            <Icon name="chevDown" className="mchev" sw={2.6} />
          </button>
          {menuOpen && (
            <div className="metric-menu">
              {all.map(m => (
                <button key={m.key} type="button" className={m.key === metricKey ? 'on' : ''}
                  onClick={e => { e.stopPropagation(); pickMetric(m.key) }}>{m.label}</button>
              ))}
            </div>
          )}
        </div>

        {!vm ? (
          <>
            <p className="subnote">{metric.sub}</p>
            <div className="nodata"><span className="nd-t">No data yet</span><span className="nd-s">We&rsquo;ll show your {metric.label.toLowerCase()} here as it comes in.</span></div>
          </>
        ) : (
          <>
            <p className="subnote">{subnote}</p>
            <div className="hero-row">
              <div className="hero-l">
                <p className="hero-num">{sel == null && !hasReliable ? '—' : display}</p>
                <p className="rangecap">{vm.cap}</p>
              </div>
              {hasReliable && (
                <div className="hero-r">
                  <p className="avg-l">Avg / {vm.sub === 'month' ? 'mo' : 'day'}</p>
                  <p className="avg-v">{fmtAvg(vm.avg)}</p>
                  {vm.avgDelta == null || Math.round(vm.avgDelta) === 0 ? (
                    vm.avgDelta == null ? null : <p className="avg-t flat"><span>No change</span></p>
                  ) : (
                    <p className={`avg-t ${vm.avgDir}`}>
                      <Icon name={vm.avgDir === 'up' ? 'arrowUp' : 'arrowDown'} sw={2.4} /><span>{Math.round(vm.avgDelta).toLocaleString()}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="chartwrap">
              <div className="chartbox">
                <div className={`bars anim`} key={`${metricKey}-${cur}-${vm.idx}`}>
                  {vm.vals.map((v, i) => {
                    if (v == null) return <div key={i} className="bar blank" style={{ height: '6%' }} />
                    const h = Math.max(3, (v / barMax) * 100)
                    const cls = 'bar' + (i === sel ? ' hi' : '')
                    return <div key={i} className={cls} style={{ height: `${h.toFixed(1)}%`, animationDelay: `${(i * 0.03).toFixed(2)}s` }}
                      onClick={() => tapBar(i)} />
                  })}
                </div>
              </div>

              {vm.xmarks ? (
                <div className="xrow xabs">
                  {vm.xmarks.map((m, i) => (
                    <span key={i} className={'xl' + (i === 0 ? ' first' : '') + (i === vm.xmarks!.length - 1 ? ' last' : '')} style={{ left: `${m.x.toFixed(1)}%` }}>{m.l}</span>
                  ))}
                </div>
              ) : vm.dayLabels ? (
                <div className="xrow">
                  {vm.dayLabels.map((d, i) => (
                    <span key={i} className="xl">{d}</span>
                  ))}
                </div>
              ) : null}

              {dataThrough && <p className="datacap">Data through {dataThrough}</p>}

              <div className="tiles">
                {vm.breakdown.map((t, i) => (
                  <div key={i} className="tile">
                    <div className="trow"><span className="tv">{t.value}</span><Icon name={t.icon} className="tic" sw={1.8} /></div>
                    <div className="tl">{t.label}</div>
                  </div>
                ))}
              </div>

              {mini && (
                <>
                  <div className="mticks">
                    {mticks.map((t, i) => (
                      <span key={i} className={'mtick' + (t.first ? ' first' : '') + (t.last ? ' last' : '')} style={{ left: `${t.x.toFixed(1)}%` }}>{t.l}</span>
                    ))}
                  </div>
                  <div className="mini">
                    <svg className="mini-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
                      <path d={mini.area} fill="var(--chart-fill)" />
                      <path d={`M0 ${mini.by.toFixed(1)} L100 ${mini.by.toFixed(1)}`} stroke="var(--ink-4)" strokeWidth={1} strokeDasharray="2 3" fill="none" vectorEffect="non-scaling-stroke" />
                      <path d={mini.d} stroke="var(--chart-line)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div className="mdots">
                      {mini.pts.map((p, i) => (
                        <button key={i} type="button" className={'mdot' + (i === vm.idx ? ' last' : '')}
                          style={{ left: `${p.x.toFixed(1)}%`, top: `${((p.y / mini.Hm) * 100).toFixed(1)}%` }}
                          onClick={() => tapDot(i)} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="seg">
              <div className="seg-ind" style={{ transform: `translateX(${segIdx * 100}%)` }} />
              {RANGES.map(r => (
                <button key={r} type="button" className={'seg-btn' + (r === cur ? ' on' : '')} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
              ))}
            </div>

            <Link className="seedetails" href="/dashboard/analytics/advanced">
              See where it came from
              <Icon name="chevDown" className="sd-chev" sw={2.6} />
            </Link>
          </>
        )}
      </section>
    </div>
  )
}
