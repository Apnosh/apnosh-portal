'use client'

/**
 * The "in production" helpers around the timeline: a one-look Now/Next summary above it, and a
 * What-to-expect + Help block below it. Purely additive to CampaignWork — computed from the same
 * status the detail page already has (phase, go-live estimate, progress), no new data. Honest: dates
 * are estimates ("your team confirms"), and it never claims a result that hasn't happened.
 */
import { Package, CalendarClock, ArrowRight, MessageCircle, ChevronDown, CheckCircle2, Check } from 'lucide-react'
import { C, DISPLAY } from '@/components/campaigns/ui'
import type { GoLiveEstimate } from '@/lib/campaigns/aggregate-golive'
import type { ShippedPhase } from '@/lib/campaigns/view'

function estLine(goLive: GoLiveEstimate, whenLine: string | null | undefined): string {
  if (whenLine) return whenLine
  if (goLive.phrase) return goLive.hasGoLive ? `Live in about ${goLive.phrase}` : `Starts in about ${goLive.phrase}`
  return 'Your team confirms the date'
}

/** The at-a-glance horizontal track: four milestones, the line filled up to where the campaign is
 *  now. Purely a picture of the same phase the spine below reads from — no new claims. */
function ProductionRail({ phase }: { phase: ShippedPhase }) {
  const stages = ['Ordered', 'Setup', 'Making', 'Live']
  // how far the line is filled: setup=1, production=2, live=3 (Live is the active dot), done=4 (all solid)
  const cur = phase === 'setup' ? 1 : phase === 'production' ? 2 : phase === 'live' ? 3 : 4
  return (
    <div style={{ display: 'flex', marginBottom: 16 }}>
      {stages.map((label, i) => {
        const done = i < cur
        const isCur = i === cur
        return (
          <div key={label} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* connector to the next dot — green once this leg is behind us */}
            {i < stages.length - 1 && (
              <div style={{ position: 'absolute', top: 10, left: '50%', width: '100%', height: 2, background: done ? C.green : C.line }} />
            )}
            <div
              className={isCur ? 'cw-breathe' : undefined}
              style={{
                position: 'relative', zIndex: 1, width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', boxSizing: 'border-box',
                background: done ? C.green : isCur ? C.greenSoft : '#fff',
                border: done ? 'none' : `2px solid ${isCur ? C.green : C.line}`,
                color: done ? '#fff' : isCur ? C.greenDk : C.faint,
              }}
            >
              {done ? <Check size={12} strokeWidth={3} /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: isCur ? C.greenDk : C.faint }} />}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: isCur ? 700 : 600, color: done || isCur ? C.ink : C.mute, marginTop: 5, whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

/** The one-look status: a chip, what's happening now, what's next, and the estimated go-live. */
export function ProductionSummary({ phase, goLive, whenLine, progress, awaitingYou }: {
  phase: ShippedPhase
  goLive: GoLiveEstimate
  whenLine: string | null | undefined
  progress: { live: number; total: number } | null
  awaitingYou: number
}) {
  const est = estLine(goLive, whenLine)
  const s = (() => {
    if (phase === 'live') return { chip: 'Live', tone: 'green' as const, now: 'It’s live and running', next: 'We track how it does and share a recap', est: 'Live now' }
    if (phase === 'done') return { chip: 'Done', tone: 'green' as const, now: 'All wrapped up', next: 'Your results are below', est: null as string | null }
    if (phase === 'setup') return { chip: 'Getting set up', tone: 'amber' as const, now: awaitingYou > 0 ? 'We’re on it — and waiting on a few things from you' : 'We’re getting everything set up', next: 'We make it, then it goes live', est }
    // production
    const madePart = progress && progress.total > 0 ? ` — ${progress.live} of ${progress.total} done` : ''
    return { chip: 'In production', tone: 'green' as const, now: `Your team is making your campaign${madePart}`, next: 'It goes live', est }
  })()
  const chipBg = s.tone === 'amber' ? C.amberBg : C.greenSoft
  const chipFg = s.tone === 'amber' ? C.amberFg : C.greenDk

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, marginTop: 24 }}>
      <ProductionRail phase={phase} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: chipBg, color: chipFg, borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: chipFg }} /> {s.chip}
      </span>
      <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: '-.01em', margin: '9px 0 2px', lineHeight: 1.2 }}>{s.now}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.mute }}>
          <ArrowRight size={14} color={C.faint} style={{ flexShrink: 0 }} /> <span><span style={{ color: C.ink, fontWeight: 600 }}>Next:</span> {s.next}</span>
        </div>
        {s.est && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.mute }}>
            <CalendarClock size={14} color={C.faint} style={{ flexShrink: 0 }} /> <span><span style={{ color: C.ink, fontWeight: 600 }}>Estimated:</span> {s.est}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Below the timeline: what this order includes + a clear way to reach the team.
 *  `items` are the ordered line items by their owner-facing names, e.g.
 *  "Polish your Google Business Profile". */
export function ProductionGuide({ items, onMessage }: { items: string[]; onMessage: () => void }) {
  const faqs = [
    { q: 'What if I want a change?', a: 'Message your team any time and tell us what to tweak — we’ll adjust before it goes out.' },
    { q: 'How will I know when it’s live?', a: 'This page updates on its own, and we’ll give you a heads-up. You don’t have to check back.' },
    { q: 'Do I owe anything else?', a: 'No — you paid at checkout. Nothing else bills for this order.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
      {/* Campaign details — exactly what this order includes, by name */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <Package size={15} color={C.greenDk} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Campaign details</div>
        </div>
        {items.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {items.map((name, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
                <CheckCircle2 size={14} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>Your team is getting everything set up.</div>
        )}
      </div>

      {/* Help / questions */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 3 }}>Questions?</div>
        <div style={{ fontSize: 12, color: C.mute, marginBottom: 11 }}>Your team is one message away.</div>
        <button onClick={onMessage} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 15px', borderRadius: 12, border: 'none', cursor: 'pointer', background: C.ink, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>
          <MessageCircle size={15} /> Message your team
        </button>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}` }}>
          {faqs.map((f, i) => (
            <details key={i} className="cw-det" style={{ borderBottom: i < faqs.length - 1 ? `1px solid ${C.line}` : 'none' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, color: C.ink }}>
                {f.q} <ChevronDown size={15} color={C.faint} className="cw-chev" style={{ flexShrink: 0 }} />
              </summary>
              <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, padding: '0 0 12px' }}>{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
