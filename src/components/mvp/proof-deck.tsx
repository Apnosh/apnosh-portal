'use client'

/**
 * The results deck: fired proof cards in the first-iteration stacked style,
 * placed on the Insights stage screen right between the histogram's dots
 * and the by-source tiles (owner call 2026-09-01). Self-contained: fetches
 * the client's live cards, marks the front card read, dismisses cross-device.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import ProofCard, { type ProofCardData } from './proof-card'

function deckDepth(pos: number): React.CSSProperties {
  if (pos === 0) return { position: 'relative', zIndex: 30, opacity: 1 }
  if (pos === 1) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20, transform: 'translateY(4px) scaleX(0.97)', opacity: 1 }
  if (pos === 2) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, transform: 'translateY(8px) scaleX(0.94)', opacity: 1 }
  return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 0, transform: 'translateY(12px) scaleX(0.91)', opacity: 0, pointerEvents: 'none' }
}

const SAMPLE_CARDS: ProofCardData[] = [
  { id: 'example-gbp', label: 'Example · a week on Google', big: '9 calls · 31 direction taps', context: 'Up from 4 calls and 12 taps the week before.', attribution: 'Since your menu photos went live, Aug 21.', spark: [9, 12, 10, 13, 17, 22, 31] },
  { id: 'example-post', label: 'Example · a post that landed', big: '2,418 people saw it', context: '86 saved or shared it.', attribution: 'You approved it Monday. It published Tuesday at 5 pm.' },
  { id: 'example-reviews', label: 'Example · a review month', big: '6 new reviews · 4.7 average', context: 'Every one got a reply within a day.', attribution: 'Since the review kit went up by your register, Aug 2.' },
  { id: 'example-down', label: 'Example · a quieter week', big: '3 calls · 14 direction taps', context: 'Down from 7 calls and 24 taps the week before. A push this week turns it around.', tone: 'heads_up', cta: { label: 'Plan the push', href: '/campaigns/new' } },
  { id: 'example-start', label: 'Example · grow', big: 'Start your first campaign', context: 'A plan built from your numbers, ready in a few minutes.', tone: 'heads_up', cta: { label: 'Start a campaign', href: '/campaigns/new' } },
]

export default function ProofDeck({ clientId, mute = '#6e6e73' }: { clientId?: string; mute?: string }) {
  const [cards, setCards] = useState<ProofCardData[]>([])
  const [examples, setExamples] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState(0)
  const readMarked = useRef<Set<string>>(new Set())
  /* swipe (owner 2026-09-04: "make results card swipable"): drag the front card sideways;
     past the threshold it flies off and the next one comes up (left = next, right = back).
     A vertical drag scrolls the page as usual; taps inside the card still work. */
  const [dx, setDx] = useState(0)
  const [flying, setFlying] = useState<0 | -1 | 1>(0)
  const drag = useRef<{ x: number; y: number; horiz: boolean | null } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; drag.current = { x: t.clientX, y: t.clientY, horiz: null }; setFlying(0) }
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current; if (!d) return
    const t = e.touches[0]; const mx = t.clientX - d.x, my = t.clientY - d.y
    if (d.horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) d.horiz = Math.abs(mx) > Math.abs(my)
    if (d.horiz) setDx(mx)
  }
  const onTouchEnd = () => {
    const d = drag.current; drag.current = null
    if (!d || !d.horiz) { setDx(0); return }
    const n = cards.length
    if (n > 1 && Math.abs(dx) > 64) {
      const dir: -1 | 1 = dx < 0 ? -1 : 1
      setFlying(dir)
      window.setTimeout(() => { setStep((p) => (dir < 0 ? (p + 1) % n : (p - 1 + n) % n)); setFlying(0); setDx(0) }, 220)
    } else setDx(0)
  }

  useEffect(() => {
    /* ?demo=proof shows the four sample cards (labeled) so the placement can
     * be judged on an account with nothing fired yet. Reads no real data. */
    try {
      if (new URLSearchParams(window.location.search).get('demo') === 'proof') {
        setCards(SAMPLE_CARDS); setExamples(true); setLoaded(true)
        return
      }
    } catch { /* no window */ }
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/proof?clientId=${clientId}&list=1&state=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !Array.isArray(j?.cards)) return
        // X on a STATE card rests it for a day, not a week: these describe where the account
        // stands, and the owner should see them again tomorrow. The key changed (v2) so every
        // earlier hide is forgotten once, which brings a hidden only-card straight back.
        const hidden = (id: string) => {
          try {
            const raw = localStorage.getItem(`proof-hide-v2-${id}`)
            if (!raw) return false
            const ts = Number(raw)
            const rest = id.startsWith('state-') ? 86400e3 : 7 * 86400e3
            return Number.isFinite(ts) ? Date.now() - ts < rest : true
          } catch { return false }
        }
        const mapped: ProofCardData[] = (j.cards as Array<Record<string, unknown>>)
          .filter((c) => !c.dismissed_at)
          .filter((c) => !hidden(String(c.card_key ?? c.id)))
          .slice(0, 5)
          .map((c) => ({
            id: String(c.card_key ?? c.id),
            label: String(c.label), big: String(c.big), context: String(c.context),
            attribution: (c.attribution as string) ?? undefined,
            spark: Array.isArray(c.spark) ? (c.spark as number[]) : undefined,
            firedAt: (c.fired_at as string) ?? undefined,
            tone: (c.tone as ProofCardData['tone']) ?? 'win',
            cta: (c.cta as ProofCardData['cta']) ?? undefined,
          }))
        // a real account never sees samples (owner 2026-09-03): every client has at least one
        // real card, so an empty deck here means the owner hid it — stay quiet, not fake
        setCards(mapped); setExamples(false)
        setLoaded(true)
      })
      .catch(() => { if (alive) { setCards([]); setExamples(false); setLoaded(true) } })
    return () => { alive = false }
  }, [clientId])

  const act = (id: string, action: 'read' | 'dismiss') => {
    if (!clientId || id.startsWith('example-')) return
    // State cards are not stored: a dismissal rests on this device for 7 days.
    if (id.startsWith('state-')) {
      if (action === 'dismiss') { try { localStorage.setItem(`proof-hide-v2-${id}`, String(Date.now())) } catch { /* storage off */ } }
      return
    }
    void fetch('/api/dashboard/proof', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, id, action }),
    }).catch(() => { /* best effort */ })
  }

  const safeStep = Math.min(step, Math.max(0, cards.length - 1))
  const deck = cards.slice(safeStep, safeStep + 3)
  const front = deck[0]

  useEffect(() => {
    if (front && !readMarked.current.has(front.id)) {
      readMarked.current.add(front.id)
      act(front.id, 'read')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front?.id])

  if (!loaded || !front) return null
  return (
    <div style={{ padding: '0 18px', marginBottom: 18, isolation: 'isolate' }}>{/* the stacked cards' z-indexes stay inside this box, under the floating top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: '#1d1d1f' }}>
          {examples ? 'Examples' : 'Results'}{examples && <span style={{ fontSize: 12.5, fontWeight: 400, color: mute }}> · your results land here</span>}
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* the pager: one dot per card, the front one long — tap to advance (owner 2026-09-04: the old "2 of 5 ›" text looked ugly) */}
          {cards.length > 1 && (
            <button
              type="button"
              aria-label={`Card ${safeStep + 1} of ${cards.length}. Next card`}
              onClick={() => setStep((p) => (p + 1) % cards.length)}
              style={{ display: 'inline-flex', gap: 4, alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px' }}
            >
              {cards.map((c, i) => <span key={c.id} style={{ width: i === safeStep ? 16 : 6, height: 6, borderRadius: 99, background: i === safeStep ? '#2e9a78' : '#d9d9de', transition: 'width .2s, background .2s' }} />)}
            </button>
          )}
          <Link href="/dashboard/results" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 28, padding: '0 10px 0 12px', borderRadius: 99, background: '#f0f0f2', color: '#1d1d1f', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>See all <ChevronRight size={14} color="#6e6e73" /></Link>
        </span>
      </div>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} style={{ position: 'relative', paddingBottom: deck.length > 1 ? 9 : 0, touchAction: 'pan-y' }}>
        {deck.map((c, pos) => (
          <div key={c.id} style={{ ...deckDepth(pos), transformOrigin: 'top center', transition: drag.current && pos === 0 ? 'none' : 'transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s', height: pos === 0 ? undefined : '100%',
            ...(pos === 0 && (dx !== 0 || flying !== 0) ? { transform: flying !== 0 ? `translateX(${flying * 120}%) rotate(${flying * 8}deg)` : `translateX(${dx}px) rotate(${dx / 22}deg)`, opacity: flying !== 0 ? 0 : 1, transition: flying !== 0 ? 'transform .22s ease-in, opacity .22s ease-in' : 'none' } : {}) }}>
            {pos === 0 ? (
              <ProofCard
                card={c}
                defaultOpen
                onDismiss={() => {
                  if (examples) { setStep((p) => (p + 1) % cards.length); return }
                  act(c.id, 'dismiss'); setCards((prev) => prev.filter((x) => x.id !== c.id))
                }}
              />
            ) : (
              <div style={{ borderRadius: 18, height: '100%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
