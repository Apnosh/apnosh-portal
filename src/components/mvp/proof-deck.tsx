'use client'

/**
 * The results deck: fired proof cards in the first-iteration stacked style,
 * placed on the Insights stage screen right between the histogram's dots
 * and the by-source tiles (owner call 2026-09-01). Self-contained: fetches
 * the client's live cards, marks the front card read, dismisses cross-device.
 */

import { useEffect, useRef, useState } from 'react'
import ProofCard, { type ProofCardData } from './proof-card'
import { useLang } from './mvp-language'
import { isWin, metricKeyOf } from '@/lib/love/win'

/* THE STACK, evenly stepped (owner 2026-09-11). Each card behind the front one sits exactly
   PEEK px lower and a little narrower, and is the SAME HEIGHT as the front card, so the visible
   lip under the front is one even band per card. The back cards used to be the height of the
   whole box (front card + bottom padding), so the first lip was three times the second. */
const PEEK = 6
function deckDepth(pos: number): React.CSSProperties {
  if (pos === 0) return { position: 'relative', zIndex: 30, opacity: 1 }
  const behind = { position: 'absolute' as const, left: 0, right: 0, top: 0, height: `calc(100% - ${PEEK * 2}px)` }
  if (pos === 1) return { ...behind, zIndex: 20, transform: `translateY(${PEEK}px) scaleX(0.965)`, opacity: 1 }
  if (pos === 2) return { ...behind, zIndex: 10, transform: `translateY(${PEEK * 2}px) scaleX(0.93)`, opacity: 1 }
  return { ...behind, zIndex: 0, transform: `translateY(${PEEK * 3}px) scaleX(0.895)`, opacity: 0, pointerEvents: 'none' }
}

const SAMPLE_CARDS: ProofCardData[] = [
  { id: 'example-gbp', label: 'Example · a week on Google', big: '9 calls · 31 direction taps', context: 'Calls: 9, up from 4. Direction taps: 31, up from 12.', attribution: 'Since your menu photos went live, Aug 21.', spark: [9, 12, 10, 13, 17, 22, 31] },
  { id: 'example-post', label: 'Example · a post that landed', big: '2,418 people saw it', context: '86 saved or shared it.', attribution: 'You approved it Monday. It published Tuesday at 5 pm.' },
  { id: 'example-reviews', label: 'Example · a review month', big: '6 new reviews · 4.7 average', context: 'Every one got a reply within a day.', attribution: 'Since the review kit went up by your register, Aug 2.' },
  { id: 'example-down', label: 'Example · a quieter week', big: '3 calls · 14 direction taps', context: 'Calls: 3, down from 7. Direction taps: 14, down from 24. Worth a push this week.', tone: 'heads_up', cta: { label: 'Plan the push', href: '/campaigns/new' } },
  { id: 'example-start', label: 'Example · grow', big: 'Start your first campaign', context: 'A plan built from your numbers, ready in a few minutes.', tone: 'heads_up', cta: { label: 'Start a campaign', href: '/campaigns/new' } },
]

export default function ProofDeck({ clientId }: { clientId?: string }) {
  const { T } = useLang()
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
            cardType: String(c.card_type ?? ''),
            // both facts the win rules need beyond the big line: a seeded demo card is never a
            // win, and a rating's line is a pair whose second half is the number that is true now
            isSample: c.is_sample === true,
            metricKey: metricKeyOf(c.metadata),
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

  const act = (id: string, action: 'read' | 'open' | 'dismiss') => {
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

  /* The back cards are sized to the FRONT CARD ITSELF, measured, not to the box around it: the
     card carries its own bottom margin, and sizing the back cards to the box made the first lip
     three times the second (owner 2026-09-11: "uniform spacing between the cards in the back"). */
  const frontRef = useRef<HTMLDivElement | null>(null)
  const [frontH, setFrontH] = useState<number | null>(null)
  useEffect(() => {
    const el = frontRef.current?.firstElementChild as HTMLElement | null
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setFrontH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  })
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
      {/* No heading, no pager, no See all (owner 2026-09-11): the stack is the thing. The example
          deck still says so on the card itself, since a sample must never read as a result. */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} style={{ position: 'relative', paddingBottom: deck.length > 1 ? PEEK * 2 : 0, touchAction: 'pan-y' }}>
        {deck.map((c, pos) => (
          <div key={c.id} ref={pos === 0 ? frontRef : undefined} style={{ ...deckDepth(pos), ...(pos > 0 && frontH ? { height: frontH } : {}), transformOrigin: 'top center', transition: drag.current && pos === 0 ? 'none' : 'transform .32s cubic-bezier(.2,.7,.3,1), opacity .32s',
            ...(pos === 0 && (dx !== 0 || flying !== 0) ? { transform: flying !== 0 ? `translateX(${flying * 120}%) rotate(${flying * 8}deg)` : `translateX(${dx}px) rotate(${dx / 22}deg)`, opacity: flying !== 0 ? 0 : 1, transition: flying !== 0 ? 'transform .22s ease-in, opacity .22s ease-in' : 'none' } : {}) }}>
            {pos === 0 ? (
              <ProofCard
                /* a win gets its second door: the page where it becomes something to send
                   somebody. The same rules the share route enforces decide which cards get it. */
                card={!examples && isWin({ cardKey: c.id, cardType: c.cardType ?? '', big: c.big, isSample: c.isSample, metricKey: c.metricKey })
                  ? { ...c, share: { label: T('Show someone'), href: `/dashboard/wins/${encodeURIComponent(c.id)}` } }
                  : c}
                defaultOpen
                onOpen={() => act(c.id, 'open')}
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
