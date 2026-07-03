'use client'

/**
 * PlanAnalyzing — the "AI is building your plan" screen between the madlib and the plan reveal. It
 * wears the SAME skin as the madlib screens for the campaign being built: the campaign's own type
 * gradient (gType) and its hand-drawn illustration (Art), both reused straight from apnosh-campaign,
 * so it's a seamless continuation, not a separate screen. It narrates the REAL analysis the brain
 * does using this account's actual signals; each sub-line is real where the data exists and degrades
 * to a plain truthful label when it doesn't. Timed to the live plan-mix call via `ready`: runs its
 * staged steps, holds the last one until the brain resolves, then hands off. Reduced-motion safe and
 * mobile-first (fills the viewport, vertically centered, scrolls on short screens).
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Store, Star, MapPin, Target, Sparkles, FileText, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CampaignProfile } from '@/lib/campaigns/builder/campaign-profile'
// Reuse the builder's real illustration + type-gradient so this screen matches the madlib exactly.
import { Art as ArtRaw, gType as gTypeRaw, catGet as catGetRaw } from '@/components/mvp/campaign-builder/apnosh-campaign'

const Art = ArtRaw as ComponentType<{ id: string; size?: number }>
const gType = gTypeRaw as (t?: string) => string
const catGet = catGetRaw as (id: string) => { type?: string } | undefined

const STEP_MS = 760
const MIN_TOTAL_MS = 3000
const CAL = "'Cal Sans', Poppins, system-ui, sans-serif"
const INTER = 'Inter, system-ui, sans-serif'
const W = (a: number) => `rgba(255,255,255,${a})`

const KEYFRAMES = `
@keyframes paSpin{to{transform:rotate(360deg)}}
@keyframes paRipple{0%{transform:scale(.55);opacity:.85}100%{transform:scale(1.05);opacity:0}}
@keyframes paBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes paPop{0%{transform:scale(.5)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes paPulse{0%,100%{opacity:1}50%{opacity:.62}}
`

interface Step { title: string; detail: string | null; Icon: LucideIcon }

function buildSteps(profile: CampaignProfile | null, goalLabel: string): Step[] {
  const p = profile
  const biz = [p?.cuisine, p?.neighborhood].filter(Boolean).join(' · ')
  const reviews = p?.rating != null
    ? `${p.rating}★${p.ratingCount ? ` from ${p.ratingCount} reviews` : ''}`
    : null
  return [
    { title: 'Reading your business', detail: biz || 'Your profile and menu', Icon: Store },
    { title: 'Going through your reviews', detail: reviews || 'Checking your reputation', Icon: Star },
    { title: 'Checking how locals find you', detail: 'Your Google listing and search', Icon: MapPin },
    { title: 'Locking onto your goal', detail: goalLabel, Icon: Target },
    { title: 'Choosing the plays that fit', detail: 'Matching the right services to you', Icon: Sparkles },
    { title: 'Writing your plan', detail: 'Stages, dates and pricing', Icon: FileText },
  ]
}

export default function PlanAnalyzing({
  restaurant, itemId, profile, goalLabel, ready, tailored, onDone,
}: {
  restaurant: string
  /** The campaign/item being built — drives the matching gradient + illustration. */
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
  const bg = useMemo(() => gType(catGet(itemId)?.type), [itemId])
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f5f5f7', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <style>{KEYFRAMES}</style>
      {/* centered phone-width column (matches CampaignPlanFlow), not a full-desktop bleed */}
      <div style={{ width: '100%', maxWidth: 480, minHeight: '100dvh', background: bg, color: '#fff', boxShadow: '0 0 40px rgba(0,0,0,0.06)', boxSizing: 'border-box', padding: '26px 22px 30px', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: INTER, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: W(0.92) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" /></svg>
            Apnosh AI
          </span>
          <span style={{ fontFamily: INTER, fontSize: 11.5, color: W(0.7), fontVariantNumeric: 'tabular-nums' }}>
            {finished ? 'Done' : `Step ${Math.min(idx + 1, steps.length)} of ${steps.length}`}
          </span>
        </div>

        {/* body centered in the space below the pinned header */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        {!finished && (
          <>
            {/* hand-drawn illustration for this campaign, in a soft frosted disc with scanning rings */}
            <div style={{ position: 'relative', width: 124, height: 124, margin: '2px auto 16px', flexShrink: 0 }}>
              {!reduce && [0, 0.85, 1.7].map((d, i) => (
                <span key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.5px solid ${W(0.42)}`, animation: 'paRipple 2.6s ease-out infinite', animationDelay: `${d}s` }} />
              ))}
              <span style={{ position: 'absolute', inset: 18, borderRadius: '50%', background: W(0.16), backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', border: `1px solid ${W(0.4)}`, boxShadow: `inset 0 1px 12px ${W(0.35)}, 0 10px 26px rgba(0,0,0,.14)`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: reduce ? undefined : 'paBreathe 2.6s ease-in-out infinite' }}>
                <Art id={itemId} size={64} />
              </span>
            </div>
            <div style={{ textAlign: 'center', fontFamily: CAL, fontSize: 23, fontWeight: 600, letterSpacing: '-.3px' }}>Analyzing {restaurant}</div>
            <div style={{ textAlign: 'center', fontFamily: INTER, fontSize: 13, color: W(0.85), marginTop: 4, marginBottom: 22 }}>Building a plan around what&rsquo;s real for you</div>
          </>
        )}

        {finished && (
          <div style={{ textAlign: 'center', padding: '22px 0 14px' }}>
            <div style={{ width: 60, height: 60, margin: '0 auto 14px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 28px rgba(0,0,0,.18)', animation: reduce ? undefined : 'paPop .45s ease' }}>
              <Check size={30} color="#2e9a78" strokeWidth={2.8} />
            </div>
            <div style={{ fontFamily: CAL, fontSize: 22, fontWeight: 600 }}>Your plan is ready</div>
            {/* Honest finish: only claim "what we found" when the brain genuinely tailored the mix. */}
            <div style={{ fontFamily: INTER, fontSize: 13, color: W(0.85), marginTop: 4 }}>
              {tailored === false ? 'A proven starter plan. It sharpens as your data grows.' : 'Built around what we found'}
            </div>
          </div>
        )}

        {!finished && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {steps.map((s, i) => {
              const state = i < idx ? 'done' : i === idx ? 'active' : 'pending'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 4px', opacity: state === 'pending' ? 0.5 : 1, transition: 'opacity .4s ease' }}>
                  <span style={{ width: 27, height: 27, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: state === 'done' ? '#fff' : W(0.14), border: `1px solid ${state === 'done' ? '#fff' : W(0.28)}` }}>
                    {state === 'active' && !reduce && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${W(0.25)}`, borderTopColor: '#fff', animation: 'paSpin .8s linear infinite' }} />}
                    {state === 'done'
                      ? <Check size={14} color="#2e9a78" strokeWidth={3} style={{ animation: reduce ? undefined : 'paPop .35s ease' }} />
                      : state === 'pending'
                        ? <s.Icon size={14} color={W(0.85)} strokeWidth={2} />
                        : null}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: INTER, fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: '#fff', animation: state === 'active' && !reduce ? 'paPulse 1.6s ease-in-out infinite' : undefined }}>{s.title}</span>
                    {s.detail && <span style={{ display: 'block', fontFamily: INTER, fontSize: 11.5, color: W(0.82), marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.detail}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ height: 5, borderRadius: 99, background: W(0.22), marginTop: 22, overflow: 'hidden', flexShrink: 0 }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 99, background: '#fff', boxShadow: `0 0 10px ${W(0.6)}`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
        </div>
        </div>
      </div>
    </div>
  )
}
