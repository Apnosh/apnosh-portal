'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, Tag, Store, Star, Heart, Camera, Mail, Truck, Video, ShoppingCart, MapPin, type LucideIcon } from 'lucide-react'
import { PrimaryPill, IconTile, hueOf, DISPLAY, CARD_SHADOW } from '../ui'
import { liveForChip } from '@/lib/campaigns/data/chip-shelf'
import { DEFAULT_SHAPE, isShelfShape, type ShelfShape } from '@/lib/clients/shape'
import { shelfCard } from '@/lib/campaigns/data/shelf'

interface Props {
  bizName: string
  /** The owner's top goals (GOAL_CHIPS strings), so the finish can show a first plan. */
  goals?: string[]
  /** How the business runs, as just answered. The finish must offer the same card the store
   *  will offer, and the store draws its shelf by shape — without this a truck owner finished
   *  setup looking at a storefront card. Unanswered reads as a storefront, same as everywhere. */
  shape?: string | null
}

/* The finish shows a first plan, not a welcome note: one Create card per goal the owner picked.
 *
 * It used to be a THIRD hand-written list of its own, and it sent people nowhere: a slow-days
 * owner to a hidden email card, a social owner to a coming-soon reel, a photo owner to a
 * coming-soon dish card. Now the card comes from the same chip-to-shelf map the store reads
 * (liveForChip), so the first thing the owner is offered is a thing they can actually order,
 * and the title and the words come from the shelf card so the two can never disagree.
 *
 * Only the LOOK is authored here: one glyph and one colour per chip, matching the goal tiles
 * they just tapped and the goal rail on Create. */
const CHIP_LOOK: Record<string, { hue: string; icon: LucideIcon; why: string }> = {
  'More customers on slow days': { hue: 'nights', icon: Tag, why: 'The cheapest test you can run on a quiet night' },
  'More foot traffic overall': { hue: 'newfaces', icon: Store, why: 'The first thing most searchers see' },
  'Build local awareness': { hue: 'brand', icon: MapPin, why: 'Being found nearby is where awareness starts' },
  'Promote a specific offering': { hue: 'announce', icon: Tag, why: 'One thing, one week, everywhere at once' },
  'Grow social following': { hue: 'catering', icon: Video, why: 'Posts reach the people already following you' },
  'Improve online reputation': { hue: 'reviews', icon: Star, why: 'An answered review is worth more than a new one' },
  'Launch something new': { hue: 'announce', icon: Tag, why: 'A launch people hear about twice' },
  'Stay top of mind': { hue: 'regulars', icon: Mail, why: 'Keeps you in their head between visits' },
  'Compete with nearby businesses': { hue: 'newfaces', icon: Store, why: 'Win the comparison people make on the map' },
  'More bookings or orders': { hue: 'online', icon: ShoppingCart, why: 'Every tap should land on you, not an app' },
  'Turn first-timers into regulars': { hue: 'regulars', icon: Heart, why: 'The second visit is the cheapest one to win' },
  'Grow catering orders': { hue: 'catering', icon: Truck, why: 'Offices book from a picture' },
  'Better photos of my food': { hue: 'event', icon: Camera, why: 'One great plate changes the whole look' },
  'Reach a younger crowd': { hue: 'brand', icon: Video, why: 'Where a younger crowd actually looks' },
}
const FALLBACK = ['More foot traffic overall', 'Improve online reputation', 'Promote a specific offering']

export default function StepDone({ bizName, goals = [], shape }: Props) {
  const router = useRouter()
  const shelfShape: ShelfShape = isShelfShape(shape) ? shape : DEFAULT_SHAPE
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const launchConfetti = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ['#4abd98', '#2e9a78', '#f0c040', '#e8804a', '#e25a6e', '#7c6df0', '#4a9de8', '#52d681']
    const pieces: Array<{
      x: number; y: number; w: number; h: number; color: string
      vy: number; vx: number; rot: number; rv: number; opacity: number
    }> = []

    for (let i = 0; i < 150; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 3 + 2,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * 360,
        rv: (Math.random() - 0.5) * 8,
        opacity: 1,
      })
    }

    let frame = 0
    function draw() {
      frame++
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      let alive = false

      pieces.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.rot += p.rv
        p.vy += 0.04
        if (frame > 80) p.opacity -= 0.015
        if (p.opacity <= 0) return
        alive = true

        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate((p.rot * Math.PI) / 180)
        ctx!.globalAlpha = Math.max(0, p.opacity)
        ctx!.fillStyle = p.color
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx!.restore()
      })

      if (alive) requestAnimationFrame(draw)
      else ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
    }
    draw()
  }, [])

  useEffect(() => {
    // The celebration is motion, so it stays quiet for anyone who asked for less.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    launchConfetti()
  }, [launchConfetti])

  /* Three cards: the first BUYABLE card on each picked goal's shelf, de-duplicated, filled
     from the fallback goals when they picked fewer than three. A goal whose shelf has nothing
     live is skipped rather than shown a door that does not open. */
  const seen = new Set<string>()
  const plan: Array<{ id: string; title: string; sub: string; why: string; hue: string; icon: LucideIcon }> = []
  for (const g of [...goals, ...FALLBACK]) {
    const look = CHIP_LOOK[g]
    if (!look) continue
    const id = liveForChip(g, shelfShape)[0]
    if (!id || seen.has(id)) continue
    const card = shelfCard(id)
    if (!card) continue
    seen.add(id)
    plan.push({ id, title: card.title, sub: card.sub || card.plain.split('.')[0], why: look.why, hue: look.hue, icon: look.icon })
    if (plan.length === 3) break
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-50"
      />
      <div className="text-center py-4">
        {/* A slowly turning ring of the goal colours behind the mark; CSS only, still
            under reduced motion. */}
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .ob-done-ring { animation: obDoneSpin 8s linear infinite }
            @keyframes obDoneSpin { to { transform: rotate(360deg) } }
          }
        `}</style>
        <div aria-hidden className="relative inline-flex items-center justify-center mb-4" style={{ width: 110, height: 110 }}>
          <div className="ob-done-ring absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 200deg, #f6a23a, #34b6ae, #9a5bf0, #f7c948, #4abd98, #f6a23a)', filter: 'blur(14px)', opacity: 0.55 }} />
          <div className="absolute rounded-full" style={{ inset: 14, background: '#fff', boxShadow: 'inset 0 0 0 1.5px rgba(74,189,152,.45), 0 10px 30px rgba(0,0,0,.08)' }} />
          <span className="relative text-4xl">🎉</span>
        </div>
        <h2
          className="text-[27px] mb-2"
          style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-0.01em', lineHeight: 1.1 }}
        >
          Welcome{bizName ? `, ${bizName}` : ''}!
        </h2>
        <p className="text-[14.5px] leading-relaxed mb-5" style={{ color: '#6e6e73' }}>
          From what you told us, here is where we would start.
        </p>

        <div className="text-left flex flex-col gap-2.5 mb-6">
          {plan.map((c) => {
            const Icon = c.icon
            const [, deep] = hueOf(c.hue)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/dashboard/campaigns/new?template=${c.id}`)}
                className="ob-card flex items-center gap-3 rounded-[18px] p-3 text-left"
                style={{ background: '#fff', boxShadow: CARD_SHADOW, border: 'none' }}
              >
                <IconTile hue={c.hue} size={52} radius={14}><Icon size={22} strokeWidth={2.2} /></IconTile>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px]" style={{ fontFamily: DISPLAY, fontWeight: 600, color: '#1d1d1f' }}>{c.title}</div>
                  <div className="text-[12px]" style={{ color: '#6e6e73', marginTop: 1 }}>{c.sub}</div>
                  <div className="text-[11.5px] font-semibold" style={{ color: deep, marginTop: 3 }}>{c.why}</div>
                </div>
              </button>
            )
          })}
        </div>

        <PrimaryPill onClick={() => router.push('/dashboard')} grow>
          Go to my dashboard
        </PrimaryPill>
        <div className="text-[12px] mt-3" style={{ color: '#aeaeb2' }}>Nothing starts until you say so.</div>
      </div>
    </>
  )
}
