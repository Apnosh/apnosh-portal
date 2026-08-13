'use client'

/**
 * Pull down to refresh — the phone gesture, on the owner's own data.
 *
 * The dashboard already refreshes itself on view, but that respects a 90 minute interval
 * because that is how often the vendor actually has anything new. This is the owner overriding
 * that: a deliberate tug says "get me everything you can, right now", and the route drops to a
 * 30 second floor for a forced pull.
 *
 * Honesty rules, because a gesture that lies is worse than no gesture:
 *   · it never claims to have fetched something it did not — a forced pull inside the floor
 *     says "Already up to date" rather than pretending to work
 *   · the spinner stays up until the data is actually back, not for a fixed animation
 *   · a failed pull says so and leaves the numbers that were already on screen alone
 *
 * Attaches to an existing scroll container rather than owning one, so it can be dropped into
 * screens that already have their own layout without changing how they scroll.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Check, RefreshCw } from 'lucide-react'

/** How far the finger travels before the release counts as a refresh. */
const TRIGGER_PX = 68
/** Cap so the rubber band cannot be dragged down the whole screen. */
const MAX_PULL = 96

type Phase = 'idle' | 'pulling' | 'ready' | 'working' | 'done' | 'failed'

export function usePullToRefresh(
  getScroller: () => HTMLElement | null,
  onRefresh: () => Promise<{ ok: boolean; changed: boolean }>,
) {
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  /* Refs, not state, for anything the touch handlers read: listeners are attached once and
   * would otherwise close over the first render's values. */
  const startY = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const busy = useRef(false)
  phaseRef.current = phase

  useEffect(() => {
    const el = getScroller()
    if (!el) return

    const onStart = (e: TouchEvent) => {
      /* Only from a genuine top-of-list, and never mid-refresh. Anywhere else the browser's own
       * scrolling must stay untouched. */
      if (busy.current || el.scrollTop > 0) { startY.current = null; return }
      startY.current = e.touches[0]?.clientY ?? null
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busy.current) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current
      if (dy <= 0) { setPull(0); setPhase('idle'); return }
      if (el.scrollTop > 0) { startY.current = null; setPull(0); setPhase('idle'); return }
      /* Resistance: the further it goes the harder it pulls, so the band feels like the phone's
       * own and cannot be yanked to the bottom of the screen. */
      const eased = Math.min(MAX_PULL, dy * 0.55)
      setPull(eased)
      setPhase(eased >= TRIGGER_PX ? 'ready' : 'pulling')
      if (e.cancelable) e.preventDefault()
    }

    const onEnd = async () => {
      const wasReady = phaseRef.current === 'ready'
      startY.current = null
      if (!wasReady || busy.current) { setPull(0); setPhase('idle'); return }
      busy.current = true
      setPhase('working')
      setPull(TRIGGER_PX)
      try {
        const r = await onRefresh()
        setPhase(r.ok ? 'done' : 'failed')
      } catch {
        setPhase('failed')
      }
      /* Hold the result briefly so the owner SEES what happened, then settle back. */
      setTimeout(() => { setPull(0); setPhase('idle'); busy.current = false }, 900)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [getScroller, onRefresh])

  return { pull, phase }
}

const C = { ink: '#16181d', mute: '#6b7280', faint: '#9aa1ab', green: '#4abd98', greenDk: '#2f8f70', line: '#e8e9ec' }

/** The band itself. Sits above the list and grows with the finger. */
export function PullIndicator({ pull, phase }: { pull: number; phase: Phase }) {
  if (pull <= 0 && phase === 'idle') return null
  const label =
    phase === 'working' ? 'Getting the latest…'
    : phase === 'done' ? 'Up to date'
    : phase === 'failed' ? 'Could not refresh. Your numbers are unchanged.'
    : phase === 'ready' ? 'Release to refresh'
    : 'Pull to refresh'
  const spin = phase === 'working'
  const good = phase === 'done'
  return (
    <div
      aria-live="polite"
      style={{
        height: pull, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 7, transition: phase === 'pulling' || phase === 'ready' ? 'none' : 'height .22s ease',
        color: phase === 'failed' ? C.mute : good ? C.greenDk : C.faint, fontSize: 12, fontWeight: 600,
      }}
    >
      {good ? <Check size={14} /> : spin ? <RefreshCw size={14} className="mvp-spin" /> : <ArrowDown size={14} style={{ transform: phase === 'ready' ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />}
      <span>{label}</span>
    </div>
  )
}
