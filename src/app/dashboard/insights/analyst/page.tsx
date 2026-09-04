'use client'

/**
 * /dashboard/insights/analyst — the premium "AI Analyst" read.
 *
 * Reached from the AI Analyst button in the Insights header. Reads the whole
 * funnel and shows a plain-English analysis. Every NUMBER here comes from the
 * route's `funnel` (built from the grounded payload); the AI only writes the
 * prose. Free tier gets the upgrade card (the server never spends the AI on it).
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, ArrowRight, RefreshCw, Lock, Check, TrendingDown, TrendingUp, Search, ChevronRight, BarChart3, MessageSquareText, Activity, Globe, PenLine } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import MvpShell from '@/components/mvp/mvp-shell'
import { GLASS } from '@/components/mvp/top-row'
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)'
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: '16px 16px 18px', boxShadow: CARD_SHADOW }
const STAGE_HUE = ['#2e9a78', '#3d8ed8', '#7a5fd6', '#dd9a1c', '#1fa39a']

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
  amber: '#f5a623', coral: '#a85c3c', coralBg: '#f8efe9',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"

interface FunnelStep { stage: number; label: string; value: number | null; unit?: string; isEmpty: boolean; keptFromPrevPct: number | null; changePct: number | null }

/**
 * How this stage moved against the same stage last period. Absent whenever the two
 * periods are not a fair comparison (the server decides that, not this component),
 * so no chip is the honest answer rather than a zero.
 */
function ChangeChip({ pct }: { pct: number }) {
  const up = pct > 0
  const flat = pct === 0
  const tone = flat ? { fg: C.faint, bg: '#f2f2f4' } : up ? { fg: C.greenDk, bg: C.greenSoft } : { fg: C.coral, bg: C.coralBg }
  return (
    <span
      title={`vs the period before`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: tone.bg, color: tone.fg, borderRadius: 99, padding: '3px 7px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      {!flat && (up ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
      {flat ? 'flat' : `${Math.abs(pct)}%`}
    </span>
  )
}
interface ReviewTheme { label: string; positive: number; negative: number }
interface ReviewRead { headline: string; praise: string[]; complaints: string[]; themes: ReviewTheme[]; countedOver: number }
interface ReviewStats {
  recent: { days: number; count: number; avg: number | null; mix: Record<string, number> }
  lifetime: { count: number; avg: number | null; mix: Record<string, number> }
  unanswered: number
}

/**
 * Star spread. Counted from real review rows, never from the model, so the bars are
 * safe to read literally. Shows where the weight sits at a glance: an average of 3.6
 * hides whether that is everyone shrugging or half loving and half furious.
 */
function StarBars({ mix, total }: { mix: Record<string, number>; total: number }) {
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((k) => mix[String(k)] ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = mix[String(star)] ?? 0
        const good = star >= 4
        return (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: C.mute, width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{star}&#9733;</span>
            <div style={{ flex: 1, height: 14, background: '#f2f2f4', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: good ? C.green : C.coral, borderRadius: 4, transition: 'width .3s ease' }} />
            </div>
            <span style={{ fontSize: 11.5, color: n ? C.ink : C.faint, width: 34, fontVariantNumeric: 'tabular-nums' }}>
              {n}{total > 0 ? ` (${Math.round((n / total) * 100)}%)` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * What people talk about, and whether they are happy about it.
 *
 * Each bar is a count of REAL reviews: the model tagged which quotes belong to which
 * topic, and the counting happened server-side over quotes proven to exist. So a bar
 * of 4 means four people actually said it.
 */
function ThemeBars({ themes, countedOver }: { themes: ReviewTheme[]; countedOver: number }) {
  const max = Math.max(1, ...themes.map((t) => t.positive + t.negative))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {themes.map((t) => {
        const total = t.positive + t.negative
        return (
          <div key={t.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
              <span style={{ fontSize: 11.5, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                {t.negative > 0 && <span style={{ color: C.coral, fontWeight: 700 }}>{t.negative} unhappy</span>}
                {t.negative > 0 && t.positive > 0 && ' · '}
                {t.positive > 0 && <span style={{ color: C.greenDk, fontWeight: 700 }}>{t.positive} happy</span>}
              </span>
            </div>
            <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: '#f2f2f4', width: `${(total / max) * 100}%`, minWidth: 40 }}>
              {t.negative > 0 && <div style={{ flex: t.negative, background: C.coral }} />}
              {t.positive > 0 && <div style={{ flex: t.positive, background: C.green }} />}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: C.faint, marginTop: 2, lineHeight: 1.45 }}>
        Counted across the {countedOver} reviews with enough written in them to read.
      </div>
    </div>
  )
}
interface Read { bottomLine: string; working: string[]; fixes: Array<{ move: string; why: string }>; blindSpots: string[]; reviews: ReviewRead | null
  trends?: Array<{ stage: number; label: string; read: string }>
  outside?: { summary: string; items: Array<{ note: string; source: string | null }> } | null
  gaps?: Array<{ gap: string; why: string; fix: string }>
  numbers?: { trends: Array<{ stage: number; label: string; firstAvg: number; lastAvg: number; changePct: number | null; days: number }>; rhythm: { strongestDay: string; weakestDay: string; weekendVsWeekdayPct: number | null; byDay: Array<{ day: string; avg: number }> } | null; standouts: Array<{ date: string; value: number; vsWeekPct: number; holiday: string | null; weekday: string }>; launches: Array<{ name: string; date: string; stage: string }> }
}
function ReviewsBlock({ r, stats }: { r: ReviewRead; stats: ReviewStats | null }) {
  return (
    <Section title="What people are saying">
      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>{r.headline}</div>

      {stats && stats.recent.count > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.mute }}>Star spread</span>
            <span style={{ fontSize: 11.5, color: C.faint }}>{stats.recent.count} reviews, avg {stats.recent.avg ?? '-'}</span>
          </div>
          <StarBars mix={stats.recent.mix} total={stats.recent.count} />
        </div>
      )}

      {r.themes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.mute, marginBottom: 8 }}>What they talk about</div>
          <ThemeBars themes={r.themes} countedOver={r.countedOver} />
        </div>
      )}
      {r.complaints.length > 0 && (
        <div style={{ marginBottom: r.praise.length ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.coral, marginBottom: 6 }}>They complain about</div>
          {r.complaints.map((t) => (
            <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 13.5, lineHeight: 1.45 }}>
              <span style={{ color: C.coral, fontWeight: 700, lineHeight: 1.45 }}>&bull;</span> {t}
            </div>
          ))}
        </div>
      )}
      {r.praise.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 6 }}>They love</div>
          {r.praise.map((t) => (
            <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 13.5, lineHeight: 1.45 }}>
              <span style={{ color: C.greenDk, fontWeight: 700, lineHeight: 1.45 }}>&bull;</span> {t}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

interface AnalystResponse {
  locked?: boolean
  read?: Read
  funnel?: FunnelStep[]
  reviewStats?: ReviewStats | null
  reputation?: { rating: number | null; reviewCount: number | null }
  business?: { name: string }
  generatedAt?: string
}

function whenLabel(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return 'Generated ' + d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AnalystPage() {
  const router = useRouter()
  const { client } = useClient()
  const [state, setState] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading')
  const [data, setData] = useState<AnalystResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [queries, setQueries] = useState<{ query: string; impressions: number }[]>([])
  useEffect(() => {
    if (!client?.id) return
    let live = true
    fetch(`/api/dashboard/insights-detail?clientId=${client.id}`).then((r) => r.json()).then((j) => { if (live && Array.isArray(j?.topQueries)) setQueries(j.topQueries.slice(0, 6)) }).catch(() => {})
    return () => { live = false }
  }, [client?.id])

  // First open serves the cached read (cheap); the Refresh button forces a
  // fresh generate (refresh: true skips the cache on the server).
  //
  // Every path below MUST end in a state that renders something. This page used to
  // have three ways to show a completely blank screen, which is worse than an error:
  // the owner cannot tell a broken page from a slow one, and there is nothing to
  // report. Now a failure always names itself and always offers Try again.
  const run = useCallback((refresh = false) => {
    if (!client?.id) return
    setState('loading'); setErr(null)
    /* The server hands the report off to a job and answers at once ("pending"); this page
       keeps its working screen and asks again every few seconds until the read lands. Every
       path below ends in a state that renders something — a page that shows nothing is worse
       than an error. */
    let alive = true
    const started = Date.now()
    const ask = (force: boolean) => fetch('/api/dashboard/analyst', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, window: '30d', refresh: force }),
    }).then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as AnalystResponse & { error?: string; pending?: boolean }
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`)
      return j
    })
    const settle = (j: AnalystResponse & { pending?: boolean }) => {
      if (!alive) return
      if (j.locked) { setData(j); setState('locked'); return }
      if (j.pending) {
        if (Date.now() - started > 4 * 60_000) { setErr('that took too long, so we stopped waiting'); setState('error'); return }
        setTimeout(() => { if (alive) ask(false).then(settle).catch(fail) }, 4000)
        return
      }
      if (!j.read?.bottomLine) throw new Error('the analyst came back empty')
      setData(j); setState('ready')
    }
    const fail = (e: unknown) => { if (!alive) return; setErr(e instanceof Error ? e.message : 'something went wrong'); setState('error') }
    ask(refresh).then(settle).catch(fail)
    return () => { alive = false }
  }, [client?.id])

  useEffect(() => { const stop = run(false); return () => { if (typeof stop === 'function') stop() } }, [run])

  // Which restaurant we are reading for comes from context and can arrive a beat late.
  // If it never arrives, `run` returns early and the page would sit on "Reading your
  // numbers..." forever, looking broken. Say so instead.
  const waitingForClient = !client?.id
  useEffect(() => {
    if (!waitingForClient) return
    const t = setTimeout(() => {
      setErr('we could not tell which restaurant to read. Try picking it again from the menu.')
      setState('error')
    }, 8_000)
    return () => clearTimeout(t)
  }, [waitingForClient])

  void router
  return (
    <MvpShell active="home" back="/dashboard/insights" title="Report" right={state === 'ready' ? (
      <button onClick={() => run(true)} aria-label="Refresh the report" title="Refresh" style={{ ...GLASS, width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, cursor: 'pointer', boxSizing: 'border-box' }}><RefreshCw size={17} /></button>
    ) : undefined}>
      <div style={{ padding: '12px 18px 24px', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
        {/* Exhaustive on purpose: the last branch is a plain else, so there is no
            combination of state and data that renders an empty screen. */}
        {state === 'loading' ? <ReportWorking />
          : state === 'locked' ? <Locked />
          : state === 'ready' && data?.read ? <ReadView read={data.read} funnel={data.funnel ?? []} stats={data.reviewStats ?? null} when={whenLabel(data.generatedAt)} business={data.business?.name ?? client?.name ?? ''} queries={queries} />
          : <Centered>
              We could not put your read together{err ? `: ${err}` : '.'}
              <div style={{ marginTop: 12 }}><button onClick={() => run(false)} style={btn}>Try again</button></div>
            </Centered>}
      </div>
    </MvpShell>
  )
}
const btn: React.CSSProperties = { background: C.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, borderRadius: 99, padding: '10px 16px', cursor: 'pointer' }

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 320, color: C.faint, fontSize: 14, padding: 24, lineHeight: 1.5 }}>{children}</div>
}

// ── The read ─────────────────────────────────────────────────────────────
function ReadView({ read, funnel, stats, when, business, queries }: { read: Read; funnel: FunnelStep[]; stats: ReviewStats | null; when: string; business: string; queries: { query: string; impressions: number }[] }) {
  const topQ = Math.max(1, ...queries.map((q) => q.impressions))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* the cover: the one dark moment on the page — the period, the business, and the bottom line */}
      <div style={{ borderRadius: 20, padding: '20px 20px 22px', color: '#fff', backgroundColor: '#16211c', backgroundImage: 'radial-gradient(circle at 88% 8%, rgba(74,189,152,0.42), transparent 55%)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(22,33,28,0.22)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>Your report · last 30 days{business ? ` · ${business}` : ''}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, lineHeight: 1.25, marginTop: 10, letterSpacing: '-.01em' }}>{read.bottomLine}</div>
        {when && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 12 }}>{when} · read from your real numbers, never guesses</div>}
      </div>

      {/* the scorecard: four numbers you can read in a glance before any words */}
      <Scorecard funnel={funnel} stats={stats} />

      {funnel.length > 0 && (
        <Section title="Your funnel" sub="each step, drawn to size; the small number is how much of the step before it kept">
          <FunnelDrawing funnel={funnel} />
          <div style={{ display: 'none' }}>
            {funnel.map((f, i) => (
              <div key={f.stage} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: STAGE_HUE[i] ?? C.green, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: f.isEmpty ? C.faint : C.ink }}>{f.label}</span>
                  {f.keptFromPrevPct != null && <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>kept {f.keptFromPrevPct}% of the step before</span>}
                  {f.isEmpty && <span style={{ display: 'block', fontSize: 12, color: C.faint, marginTop: 1 }}>not measured yet</span>}
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: f.isEmpty || f.value == null ? C.faint : C.ink, letterSpacing: '-.01em' }}>{f.value == null ? '—' : f.value.toLocaleString()}</span>
                  {f.changePct != null && <span style={{ display: 'inline-block', marginTop: 2 }}><ChangeChip pct={f.changePct} /></span>}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(read.trends?.length ?? 0) > 0 && (
        <Section title="Where things are heading" sub="start of the window against the end, a day's average each">
          <div>
            {read.trends!.map((t, i) => {
              const n = read.numbers?.trends.find((x) => x.stage === t.stage)
              const hue = STAGE_HUE[Math.max(0, (t.stage || 1) - 1)] ?? C.green
              const mx = n ? Math.max(1, n.firstAvg, n.lastAvg) : 1
              return (
                <div key={i} style={{ padding: '11px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: hue, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, flex: 1 }}>{t.label}</span>
                    {n?.changePct != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: Math.abs(n.changePct) < 5 ? C.mute : n.changePct > 0 ? C.greenDk : C.coral }}>{Math.abs(n.changePct) < 5 ? 'steady' : `${n.changePct > 0 ? '▲' : '▼'}${Math.abs(n.changePct) > 999 ? 'sharply' : `${Math.abs(n.changePct)}%`}`}</span>}
                  </div>
                  {n && (
                    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 56px', rowGap: 5, columnGap: 8, alignItems: 'center', marginTop: 8, fontSize: 11.5, color: C.mute }}>
                      <span>then</span><div style={{ height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, (n.firstAvg / mx) * 100)}%`, height: '100%', borderRadius: 99, background: `${hue}66` }} /></div><span style={{ textAlign: 'right', color: C.ink, fontWeight: 600 }}>{n.firstAvg.toLocaleString()}</span>
                      <span>now</span><div style={{ height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, (n.lastAvg / mx) * 100)}%`, height: '100%', borderRadius: 99, background: hue }} /></div><span style={{ textAlign: 'right', color: C.ink, fontWeight: 600 }}>{n.lastAvg.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginTop: 8 }}>{t.read}</div>
                </div>
              )
            })}
          </div>
          {read.numbers?.rhythm && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${C.line}` }}>
              <div style={{ fontSize: 13, color: C.ink }}><b>{read.numbers.rhythm.strongestDay}s</b> are your strongest day{read.numbers.rhythm.weekendVsWeekdayPct != null && Math.abs(read.numbers.rhythm.weekendVsWeekdayPct) >= 8 ? <>; weekends run <b style={{ color: read.numbers.rhythm.weekendVsWeekdayPct > 0 ? C.greenDk : C.coral }}>{read.numbers.rhythm.weekendVsWeekdayPct > 0 ? '+' : ''}{read.numbers.rhythm.weekendVsWeekdayPct}%</b> against weekdays</> : null}.</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 40, marginTop: 8 }}>
                {read.numbers.rhythm.byDay.map((d) => { const mx = Math.max(1, ...read.numbers!.rhythm!.byDay.map((x) => x.avg)); const on = d.day === read.numbers!.rhythm!.strongestDay.slice(0, 3); return (
                  <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: '100%' }}>
                    <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(4, (d.avg / mx) * 100)}%`, borderRadius: 4, background: on ? C.greenDk : `${C.green}66` }} />
                    <span style={{ fontSize: 9.5, color: on ? C.greenDk : C.faint, fontWeight: on ? 700 : 500 }}>{d.day}</span>
                  </div>) })}
              </div>
            </div>
          )}
        </Section>
      )}

      {read.working.length > 0 && (
        <Section title="What's working">
          <Bullets items={read.working} tone="good" />
        </Section>
      )}

      {read.fixes.length > 0 && (
        <Section title="What to change" sub="in order, the moves that matter most">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {read.fixes.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
                <span style={{ width: 26, height: 26, borderRadius: 99, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{f.move}</span>
                  <span style={{ display: 'block', fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>{f.why}</span>
                </span>
              </div>
            ))}
          </div>
          <Link href="/dashboard/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 13.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>Start on the first one <ArrowRight size={15} /></Link>
        </Section>
      )}

      {read.reviews && <ReviewsBlock r={read.reviews} stats={stats} />}

      {queries.length > 0 && (
        <Section title="What people search to find you" sub="the exact words, from Google">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {queries.map((q) => (
              <div key={q.query}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                  <Search size={13} color={C.faint} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: C.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.query}</span>
                  <span style={{ color: C.mute, fontSize: 12.5, flexShrink: 0 }}>{q.impressions.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: C.bg, marginTop: 5, marginLeft: 21, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, (q.impressions / topQ) * 100)}%`, height: '100%', borderRadius: 99, background: C.green }} /></div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {read.outside && (
        <Section title="Outside your walls" sub="what happened in the same window, not why">
          <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{read.outside.summary}</div>
          {read.outside.items.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {read.outside.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: `0.5px solid ${C.line}`, fontSize: 13.5, lineHeight: 1.45 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: C.faint, flexShrink: 0, marginTop: 7 }} />
                  <span style={{ flex: 1, minWidth: 0, color: C.ink }}>
                    {it.note}
                    {it.source && (/^https?:/.test(it.source)
                      ? <> <a href={it.source} target="_blank" rel="noreferrer noopener" style={{ color: C.greenDk, fontWeight: 600, textDecoration: 'none' }}>source</a></>
                      : <span style={{ color: C.faint }}> · {it.source}</span>)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {(read.gaps?.length ?? 0) > 0 && (
        <Section title="Gaps and pitfalls" sub="what a professional would flag">
          <div>
            {read.gaps!.map((g, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}` }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{g.gap}</div>
                {g.why && <div style={{ fontSize: 13, color: C.mute, marginTop: 3, lineHeight: 1.45 }}>{g.why}</div>}
                {g.fix && <div style={{ fontSize: 13, color: C.greenDk, fontWeight: 600, marginTop: 5, lineHeight: 1.45 }}>Fix: <span style={{ color: C.ink, fontWeight: 500 }}>{g.fix}</span></div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {read.blindSpots.length > 0 && (
        <Section title="What we can't see yet">
          <Bullets items={read.blindSpots} tone="muted" />
          <Link href="/dashboard/connected-accounts" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 13.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>Connect a source <ChevronRight size={15} /></Link>
        </Section>
      )}
      <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, textAlign: 'center', padding: '4px 10px 0' }}>Every number here is yours. The words read what happened; they are not proof of cause.</div>
    </div>
  )
}
/* four numbers in a glance: the two lines that matter most, the rating, and what is waiting */
function Scorecard({ funnel, stats }: { funnel: FunnelStep[]; stats: ReviewStats | null }) {
  const byStage = (n: number) => funnel.find((f) => f.stage === n)
  const aw = byStage(1), ac = byStage(3)
  const tiles: Array<{ label: string; value: string; delta?: number | null; tone?: 'good' | 'bad' | 'mute' }> = [
    { label: 'Showed up', value: aw?.value != null ? aw.value.toLocaleString() : '—', delta: aw?.changePct ?? null },
    { label: 'Actions', value: ac?.value != null ? ac.value.toLocaleString() : '—', delta: ac?.changePct ?? null },
    { label: 'Rating', value: stats?.recent?.avg != null ? `${stats.recent.avg}★` : '—', tone: 'mute' },
    { label: 'Unanswered', value: stats ? String(stats.unanswered ?? 0) : '—', tone: stats && (stats.unanswered ?? 0) > 0 ? 'bad' : 'good' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {tiles.map((t) => (
        <div key={t.label} style={{ ...CARD, padding: '12px 10px 11px', textAlign: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: t.tone === 'bad' ? C.coral : C.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</div>
          <div style={{ fontSize: 10.5, color: C.mute, marginTop: 3, whiteSpace: 'nowrap' }}>{t.label}</div>
          {t.delta != null && <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3, color: t.delta > 0 ? C.greenDk : t.delta < 0 ? C.coral : C.mute }}>{t.delta > 0 ? '▲' : t.delta < 0 ? '▼' : '–'}{Math.abs(Math.round(t.delta))}%</div>}
        </div>
      ))}
    </div>
  )
}

/* the funnel drawn to size (square-root scale so the small steps stay visible), the
   kept-% written on the narrowing between steps */
function FunnelDrawing({ funnel }: { funnel: FunnelStep[] }) {
  const vals = funnel.map((f) => (f.isEmpty || f.value == null ? 0 : f.value))
  const mx = Math.max(1, ...vals)
  return (
    <div>
      {funnel.map((f, i) => {
        const hue = STAGE_HUE[i] ?? C.green
        const w = f.isEmpty || f.value == null ? 0 : Math.max(0.16, Math.sqrt(f.value / mx))
        return (
          <div key={f.stage}>
            {i > 0 && f.keptFromPrevPct != null && (
              <div style={{ fontSize: 11, color: C.mute, padding: '3px 0 3px 8px', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 1, height: 10, background: C.line }} />kept {f.keptFromPrevPct}%</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: `${w * 100}%`, minWidth: f.isEmpty ? 0 : 44, height: 34, borderRadius: 10, background: f.isEmpty ? C.bg : hue, color: '#fff', display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box', transition: 'width .3s' }}>{!f.isEmpty && f.value != null ? f.value.toLocaleString() : ''}</div>
                <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 600, color: f.isEmpty ? C.faint : C.ink, whiteSpace: 'nowrap' }}>{f.label}{f.isEmpty ? <span style={{ fontWeight: 400, color: C.faint }}> · not measured</span> : ''}</span>
              </div>
              {f.changePct != null && <span style={{ flexShrink: 0 }}><ChangeChip pct={f.changePct} /></span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── While the report is written (about a minute the first time): the work, shown. Five steps
   light in turn on a clock that matches how long each really takes, a slim bar creeps toward
   the end and only completes when the read lands, and a ghost of the report waits beneath. ── */
const WORK_STEPS: Array<{ at: number; icon: React.ReactNode; label: string; sub: string }> = [
  { at: 0, icon: <BarChart3 size={17} />, label: 'Reading your numbers', sub: 'every stage, every source, against last period' },
  { at: 7, icon: <MessageSquareText size={17} />, label: 'Reading what customers wrote', sub: 'praise and complaints, in their words' },
  { at: 16, icon: <Activity size={17} />, label: 'Following each line', sub: 'where it is heading, the days that stood out' },
  { at: 28, icon: <Globe size={17} />, label: 'Checking outside your walls', sub: 'weather, local events, the calendar' },
  { at: 44, icon: <PenLine size={17} />, label: 'Writing it up', sub: 'plain words, no jargon' },
]
function ReportWorking() {
  const [t, setT] = useState(0)
  useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(id) }, [])
  const done = WORK_STEPS.filter((w) => t >= w.at).length // steps lit so far
  const pct = Math.min(92, 8 + (1 - Math.exp(-t / 28)) * 88) // eases toward the end, never claims done
  const bone = (w: number | string, h: number, r = 8): React.CSSProperties => ({ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg, #f0f0f3 0%, #f7f7f9 45%, #f0f0f3 90%)', backgroundSize: '200% 100%', animation: 'rptGhost 1.6s ease-in-out infinite' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy aria-live="polite">
      <style>{`@keyframes rptGhost{0%{background-position:100% 0}100%{background-position:-100% 0}}@keyframes rptPulse{0%,100%{opacity:.55}50%{opacity:1}}@keyframes rptIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.rpt-in{animation:rptIn .35s ease both}.rpt-pulse{animation:rptPulse 1.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.rpt-in,.rpt-pulse,[aria-busy] *{animation:none!important}}`}</style>
      {/* the cover, being written */}
      <div style={{ borderRadius: 20, padding: '20px 20px 22px', color: '#fff', backgroundColor: '#16211c', backgroundImage: 'radial-gradient(circle at 88% 8%, rgba(74,189,152,0.42), transparent 55%)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(22,33,28,0.22)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>Your report · last 30 days</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, lineHeight: 1.25, marginTop: 10, letterSpacing: '-.01em' }}>Reading your account{t >= 28 ? ' and checking outside it' : ''}…</div>
        <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.14)', marginTop: 16, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #4abd98, #8ee5c6)', transition: 'width 1s linear' }} />
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>About a minute the first time · cached for a week after that</div>
      </div>
      {/* the steps, lighting in turn */}
      <div style={CARD}>
        {WORK_STEPS.map((w, i) => {
          const lit = i < done, active = i === done - 1
          return (
            <div key={w.label} className={lit ? 'rpt-in' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${C.line}`, opacity: lit ? 1 : 0.38, transition: 'opacity .3s' }}>
              <span className={active ? 'rpt-pulse' : undefined} style={{ width: 34, height: 34, borderRadius: 99, background: lit && !active ? C.greenSoft : active ? C.greenDk : C.bg, color: lit && !active ? C.greenDk : active ? '#fff' : C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .3s, color .3s' }}>{lit && !active ? <Check size={16} /> : w.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink }}>{w.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1 }}>{w.sub}</span>
              </span>
            </div>
          )
        })}
      </div>
      {/* the ghost of what is coming */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...CARD, padding: '12px 10px 11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><div style={bone(40, 18, 6)} /><div style={bone(48, 10, 5)} /></div>)}
      </div>
      <div style={CARD}>
        <div style={bone(120, 16, 6)} />
        {[0.9, 0.6, 0.42, 0.24, 0.16].map((w, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}><div style={bone(`${w * 100}%`, 30, 10)} /><div style={bone(70, 12, 5)} /></div>)}
      </div>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink }}>{title}</span>
        {sub && <span style={{ fontSize: 12.5, color: C.faint }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function Bullets({ items, tone }: { items: string[]; tone: 'good' | 'muted' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: tone === 'muted' ? C.mute : C.ink }}>
          <span style={{ flexShrink: 0, marginTop: 2, color: tone === 'good' ? C.greenDk : C.faint }}>{tone === 'good' ? <Check size={15} /> : <Lock size={13} />}</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  )
}

// ── Premium lock ───────────────────────────────────────────────────────────
function Locked() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 26px' }}>
      <div style={{ width: 60, height: 60, borderRadius: 17, background: C.greenSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={26} color={C.greenDk} /></div>
      {/* Name the gate before the pitch. An owner who cannot use this yet should know
          that in the first line, not after reading the whole card. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 14, background: '#f2f2f4', color: C.mute, borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700 }}>
        <Lock size={12} /> Pro plan only
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, marginTop: 10 }}>Meet your AI Analyst</div>
      <div style={{ fontSize: 13.5, color: C.mute, marginTop: 8, lineHeight: 1.55, maxWidth: 300 }}>
        It reads your whole funnel and tells you, in plain words, where people drop off and the one thing to fix next. Grounded in your real numbers, never guesses.
      </div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        {['Where people fall off', 'The next move that matters', 'Honest about what it can’t see'].map((t) => (
          <div key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.ink }}><Check size={15} color={C.greenDk} /> {t}</div>
        ))}
      </div>
      <Link href="/dashboard/billing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 22, background: C.green, color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 99, padding: '12px 20px', textDecoration: 'none' }}>Upgrade to Pro <ArrowRight size={16} /></Link>
    </div>
  )
}
