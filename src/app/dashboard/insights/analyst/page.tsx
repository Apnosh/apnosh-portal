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
import { ChevronLeft, Sparkles, ArrowRight, RefreshCw, Lock, Check, TrendingDown, TrendingUp } from 'lucide-react'
import { useClient } from '@/lib/client-context'

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
interface ReviewRead { headline: string; praise: string[]; complaints: string[] }
interface Read { bottomLine: string; working: string[]; fixes: Array<{ move: string; why: string }>; blindSpots: string[]; reviews: ReviewRead | null }

/**
 * What people are actually saying. Complaints sit ABOVE praise on purpose: an owner
 * scanning this on their phone needs the problem first, and praise reads as reassurance
 * once you have seen the problem. The whole block is absent when the analyst had too
 * few reviews to read, rather than showing an encouraging empty state.
 */
function ReviewsBlock({ r }: { r: ReviewRead }) {
  return (
    <Section title="What people are saying">
      <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: r.complaints.length || r.praise.length ? 12 : 0 }}>{r.headline}</div>
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

    // The server may spend up to 30s on a live generate. Without a client-side cap a
    // dropped connection leaves the page spinning forever with no way out.
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 45_000)

    fetch('/api/dashboard/analyst', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, window: '30d', refresh }),
      signal: ctl.signal,
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as AnalystResponse & { error?: string }
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`)
        return j
      })
      .then((j) => {
        if (j.locked) { setData(j); setState('locked'); return }
        // A 200 with no read is the blank-page case: the old code set 'ready' and then
        // rendered nothing at all because the render was guarded on data.read.
        if (!j.read?.bottomLine) throw new Error('the analyst came back empty')
        setData(j); setState('ready')
      })
      .catch((e: unknown) => {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        setErr(aborted ? 'that took too long, so we stopped waiting' : (e instanceof Error ? e.message : 'something went wrong'))
        setState('error')
      })
      .finally(() => clearTimeout(timer))
  }, [client?.id])

  useEffect(() => { run(false) }, [run])

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

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard/insights') }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
        {/* header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 6px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
          <button onClick={back} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 99, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><ChevronLeft size={24} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Sparkles size={17} color={C.greenDk} />
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.1 }}>AI Analyst</div>
          </div>
          {state === 'ready' && (
            <button onClick={() => run(true)} aria-label="Refresh" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, borderRadius: 99, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><RefreshCw size={13} /> Refresh</button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 16px 40px' }}>
          {/* Exhaustive on purpose: the last branch is a plain else, so there is no
              combination of state and data that renders an empty screen. */}
          {state === 'loading' ? <Centered>Reading your numbers&hellip;</Centered>
            : state === 'locked' ? <Locked />
            : state === 'ready' && data?.read ? <ReadView read={data.read} funnel={data.funnel ?? []} when={whenLabel(data.generatedAt)} />
            : <Centered>
                We could not put your read together{err ? `: ${err}` : '.'}
                <div style={{ marginTop: 12 }}><button onClick={() => run(false)} style={btn}>Try again</button></div>
              </Centered>}
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { background: C.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, borderRadius: 99, padding: '10px 16px', cursor: 'pointer' }

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 320, color: C.faint, fontSize: 14, padding: 24, lineHeight: 1.5 }}>{children}</div>
}

// ── The read ─────────────────────────────────────────────────────────────
function ReadView({ read, funnel, when }: { read: Read; funnel: FunnelStep[]; when: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* bottom line */}
      <div style={{ background: C.greenSoft, border: `1px solid ${C.greenLine}`, borderRadius: 16, padding: '15px 16px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: C.greenDk }}>The bottom line</div>
        <div style={{ fontSize: 16, lineHeight: 1.45, marginTop: 7, fontWeight: 500 }}>{read.bottomLine}</div>
      </div>

      {/* the funnel, numbers straight from the payload */}
      {funnel.length > 0 && (
        <Section title="Your funnel">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {funnel.map((s, i) => (
              <div key={s.stage}>
                {i > 0 && s.keptFromPrevPct != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0 3px 4px', fontSize: 11.5, color: C.faint }}>
                    <TrendingDown size={12} /> {s.keptFromPrevPct}% made it here
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 13px', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 12 }}>
                  <span style={{ fontSize: 13, color: C.mute, flex: 1 }}>{s.label}</span>
                  {s.isEmpty
                    ? <span style={{ fontSize: 12, color: C.faint }}>No data yet</span>
                    : <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600 }}>{(s.value ?? 0).toLocaleString('en-US')}</span>}
                  {!s.isEmpty && s.changePct != null && <ChangeChip pct={s.changePct} />}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {read.reviews && <ReviewsBlock r={read.reviews} />}

      {read.working.length > 0 && (
        <Section title="What's working">
          <Bullets items={read.working} tone="good" />
        </Section>
      )}

      {read.fixes.length > 0 && (
        <Section title="What to fix">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {read.fixes.map((f, i) => (
              <div key={i} style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '13px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{f.move}</div>
                {f.why && <div style={{ fontSize: 13, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>{f.why}</div>}
              </div>
            ))}
          </div>
          <Link href="/dashboard/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: C.green, color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 99, padding: '10px 16px', textDecoration: 'none' }}>Build a campaign <ArrowRight size={15} /></Link>
        </Section>
      )}

      {read.blindSpots.length > 0 && (
        <Section title="What I can't see yet">
          <Bullets items={read.blindSpots} tone="muted" />
          <Link href="/dashboard/connected-accounts" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none' }}>Connect more <ArrowRight size={14} /></Link>
        </Section>
      )}

      {when && <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', paddingTop: 4 }}>{when} &middot; from your real numbers</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.mute, marginBottom: 9 }}>{title}</div>
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
