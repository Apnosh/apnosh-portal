'use client'

/**
 * The results deck: fired proof cards in the first-iteration stacked style,
 * placed on the Insights stage screen right between the histogram's dots
 * and the by-source tiles (owner call 2026-09-01). Self-contained: fetches
 * the client's live cards, marks the front card read, dismisses cross-device.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ProofCard, { type ProofCardData } from './proof-card'

function deckDepth(pos: number): React.CSSProperties {
  if (pos === 0) return { position: 'relative', zIndex: 30, opacity: 1 }
  if (pos === 1) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20, transform: 'translateY(6px) scaleX(0.955)', opacity: 1 }
  if (pos === 2) return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10, transform: 'translateY(12px) scaleX(0.91)', opacity: 1 }
  return { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 0, transform: 'translateY(18px) scaleX(0.865)', opacity: 0, pointerEvents: 'none' }
}

const SAMPLE_CARDS: ProofCardData[] = [
  { id: 'example-gbp', label: 'Example · a week on Google', big: '9 calls · 31 direction taps', context: 'Up from 4 calls and 12 taps the week before.', attribution: 'Since your menu photos went live, Aug 21.', spark: [9, 12, 10, 13, 17, 22, 31] },
  { id: 'example-post', label: 'Example · a post that landed', big: '2,418 people saw it', context: '86 saved or shared it.', attribution: 'You approved it Monday. It published Tuesday at 5 pm.' },
  { id: 'example-reviews', label: 'Example · a review month', big: '6 new reviews · 4.7 average', context: 'Every one got a reply within a day.', attribution: 'Since the review kit went up by your register, Aug 2.' },
  { id: 'example-down', label: 'Example · a quieter week', big: '3 calls · 14 direction taps', context: 'Down from 7 calls and 24 taps the week before. A push this week turns it around.', tone: 'heads_up', cta: { label: 'Plan the push', href: '/campaigns/new' } },
]

export default function ProofDeck({ clientId, mute = '#6e6e73' }: { clientId?: string; mute?: string }) {
  const [cards, setCards] = useState<ProofCardData[]>([])
  const [examples, setExamples] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState(0)
  const readMarked = useRef<Set<string>>(new Set())

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
    fetch(`/api/dashboard/proof?clientId=${clientId}&list=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !Array.isArray(j?.cards)) return
        const mapped: ProofCardData[] = (j.cards as Array<Record<string, unknown>>)
          .filter((c) => !c.dismissed_at)
          .slice(0, 5)
          .map((c) => ({
            id: String(c.card_key ?? c.id),
            label: String(c.label), big: String(c.big), context: String(c.context),
            attribution: (c.attribution as string) ?? undefined,
            spark: Array.isArray(c.spark) ? (c.spark as number[]) : undefined,
            firedAt: (c.fired_at as string) ?? undefined,
            tone: c.card_type === 'gbp_down' ? 'heads_up' : 'win',
            cta: c.card_type === 'gbp_down' ? { label: 'Plan the push', href: '/campaigns/new' } : undefined,
          }))
        if (mapped.length) { setCards(mapped); setExamples(false) }
        else { setCards(SAMPLE_CARDS); setExamples(true) }
        setLoaded(true)
      })
      .catch(() => { if (alive) { setCards(SAMPLE_CARDS); setExamples(true); setLoaded(true) } })
    return () => { alive = false }
  }, [clientId])

  const act = (id: string, action: 'read' | 'dismiss') => {
    if (!clientId || id.startsWith('example-')) return
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
    <div style={{ padding: '0 18px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: mute }}>
          {examples ? 'Examples · your results land here' : 'Results'}
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          {cards.length > 1 && (
            <button
              type="button"
              onClick={() => setStep((p) => (p + 1) % cards.length)}
              style={{ fontSize: 11.5, fontWeight: 700, color: mute, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {safeStep + 1} of {cards.length} ›
            </button>
          )}
          <Link href="/dashboard/results" style={{ fontSize: 11.5, fontWeight: 700, color: '#0f6e56', textDecoration: 'none' }}>All</Link>
        </span>
      </div>
      <div style={{ position: 'relative', paddingBottom: deck.length > 1 ? 14 : 0 }}>
        {deck.map((c, pos) => (
          <div key={c.id} style={{ ...deckDepth(pos), transformOrigin: 'top center', transition: 'transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s', height: pos === 0 ? undefined : '100%' }}>
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
