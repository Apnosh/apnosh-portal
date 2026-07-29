'use client'

/**
 * PlanAnalyzing — the "AI is building your plan" screen between the madlib and the plan reveal,
 * in the Strategist's Desk language: a kitchen ticket printing on paper. Each line that prints is
 * a REAL signal from this account (cuisine, neighborhood, rating, goal) and degrades to a plain
 * truthful label when the data isn't there. The timing machinery is unchanged: staged steps, the
 * last one holds until the live plan-mix call resolves (`ready`), then the finish moment — whose
 * copy still refuses to claim "built around what we found" unless the brain genuinely tailored
 * the mix. Reduced-motion safe and mobile-first.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Check } from 'lucide-react'
import type { CampaignProfile } from '@/lib/campaigns/builder/campaign-profile'
import { DESK, DeskKeyframes, ReceiptFrame, TickerLine, paperGround } from '@/components/campaigns/desk/ui'
// The campaign's own hand-drawn illustration, for continuity with the builder.
import { Art as ArtRaw } from '@/components/mvp/campaign-builder/apnosh-campaign'

const Art = ArtRaw as ComponentType<{ id: string; size?: number }>

const STEP_MS = 760
const MIN_TOTAL_MS = 3000

const KEYFRAMES = `
@keyframes paSpin{to{transform:rotate(360deg)}}
@keyframes paBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes paPop{0%{transform:scale(.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
`

interface Step { title: string; detail: string | null }

function buildSteps(profile: CampaignProfile | null, goalLabel: string): Step[] {
  const p = profile
  const biz = [p?.cuisine, p?.neighborhood].filter(Boolean).join(' · ')
  const reviews = p?.rating != null
    ? `${p.rating}★${p.ratingCount ? ` · ${p.ratingCount} reviews` : ''}`
    : null
  return [
    { title: 'Your business', detail: biz || 'Profile and menu' },
    { title: 'Your reviews', detail: reviews || 'Checking reputation' },
    { title: 'How locals find you', detail: 'Google + search' },
    { title: 'Your goal', detail: goalLabel },
    { title: 'Plays that fit', detail: 'Matching services' },
    { title: 'Writing your plan', detail: 'Stages · dates · pricing' },
  ]
}

export default function PlanAnalyzing({
  restaurant, itemId, profile, goalLabel, ready, tailored, onDone,
}: {
  restaurant: string
  /** The campaign/item being built — drives the matching illustration. */
  itemId: string
  profile: CampaignProfile | null
  goalLabel: string
  /** True once the live brain call has resolved (or timed out). The last step holds until this. */
  ready: boolean
  /** Whether the brain GENUINELY tailored the mix (null while unknown). false = the safe route
   *  or a fallback kept the proven starter plan — the finish copy says so instead of claiming
   *  "built around what we found". */
  tailored?: boolean | null
  onDone: () => void
}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const steps = useMemo(() => buildSteps(profile, goalLabel), [profile, goalLabel])
  const [idx, setIdx] = useState(0)
  const [finished, setFinished] = useState(false)
  const startRef = useRef(0)
  useEffect(() => { startRef.current = Date.now() }, [])

  useEffect(() => {
    if (finished) return
    const last = steps.length - 1
    if (idx < last) {
      const t = setTimeout(() => setIdx((i) => i + 1), reduce ? 180 : STEP_MS)
      return () => clearTimeout(t)
    }
    if (idx === last && ready) {
      const elapsed = startRef.current ? Date.now() - startRef.current : MIN_TOTAL_MS
      const wait = Math.max(0, (reduce ? 0 : MIN_TOTAL_MS) - elapsed)
      const t = setTimeout(() => setFinished(true), wait + (reduce ? 0 : 320))
      return () => clearTimeout(t)
    }
  }, [idx, ready, finished, steps.length, reduce])

  useEffect(() => {
    if (!finished) return
    const t = setTimeout(onDone, reduce ? 120 : 720)
    return () => clearTimeout(t)
  }, [finished, onDone, reduce])

  const pct = finished ? 100 : Math.round((idx / steps.length) * 100)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, ...paperGround, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <DeskKeyframes />
      <style>{KEYFRAMES}</style>
      {/* centered phone-width column (matches CampaignPlanFlow), not a full-desktop bleed */}
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100dvh', boxSizing: 'border-box', padding: '26px 22px 30px', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: DESK.body, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: DESK.ink2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={DESK.mintDeep} aria-hidden><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
            Apnosh AI
          </span>
          <span style={{ fontFamily: DESK.mono, fontSize: 11, color: DESK.mute, fontVariantNumeric: 'tabular-nums' }}>
            {finished ? 'Done' : `Step ${Math.min(idx + 1, steps.length)} of ${steps.length}`}
          </span>
        </div>

        {/* body centered in the space below the pinned header */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        {!finished && (
          <>
            {/* the campaign's illustration on a plain paper disc — the strategist at the desk */}
            <div style={{ width: 96, height: 96, margin: '2px auto 14px', borderRadius: '50%', background: DESK.card, border: `1.5px solid ${DESK.line}`, boxShadow: '0 10px 26px rgba(22,33,28,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: reduce ? undefined : 'paBreathe 2.6s ease-in-out infinite' }}>
              <Art id={itemId} size={56} />
            </div>
            <div style={{ textAlign: 'center', fontFamily: DESK.disp, fontSize: 23, fontWeight: 650, letterSpacing: '-.3px', color: DESK.ink }}>Analyzing {restaurant}</div>
            <div style={{ textAlign: 'center', fontFamily: DESK.body, fontSize: 13, color: DESK.ink2, marginTop: 4, marginBottom: 20 }}>Building a plan around what&rsquo;s real for you</div>

            {/* the kitchen ticket: each real signal prints as its line is read */}
            <ReceiptFrame>
              <div style={{ fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: DESK.mute, fontWeight: 700, marginBottom: 4 }}>Reading your signals</div>
              {steps.slice(0, idx + 1).map((s, i) => (
                <TickerLine key={i} label={s.title} value={i === idx ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {!reduce && <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${DESK.mintLine}`, borderTopColor: DESK.mintDeep, animation: 'paSpin .8s linear infinite', flexShrink: 0 }} />}
                    {s.detail ?? '…'}
                  </span>
                ) : (s.detail ?? '—')} live={i === idx} />
              ))}
            </ReceiptFrame>
          </>
        )}

        {finished && (
          <div style={{ textAlign: 'center', padding: '22px 0 14px' }}>
            <div style={{ width: 60, height: 60, margin: '0 auto 14px', borderRadius: '50%', background: DESK.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 28px rgba(46,154,120,.35)', animation: reduce ? undefined : 'paPop .45s ease' }}>
              <Check size={30} color="#fff" strokeWidth={2.8} />
            </div>
            <div style={{ fontFamily: DESK.disp, fontSize: 22, fontWeight: 650, color: DESK.ink }}>Your plan is ready</div>
            {/* Honest finish: only claim "what we found" when the brain genuinely tailored the mix. */}
            <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.ink2, marginTop: 4 }}>
              {tailored === false ? 'A proven starter plan. It sharpens as your data grows.' : 'Built around what we found'}
            </div>
          </div>
        )}

        <div style={{ height: 5, borderRadius: 99, background: DESK.line, marginTop: 22, overflow: 'hidden', flexShrink: 0 }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 99, background: DESK.grad, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
        </div>
        </div>
      </div>
    </div>
  )
}
