'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, Tag, Store, Star, Heart, Camera, Mail, Truck, Video, ShoppingCart, MapPin, type LucideIcon } from 'lucide-react'
import { PrimaryPill, IconTile, hueOf, DISPLAY, CARD_SHADOW } from '../ui'

interface Props {
  bizName: string
  /** The owner's top goals (GOAL_CHIPS strings), so the finish can show a first plan. */
  goals?: string[]
}

/* The finish shows a first plan, not a welcome note: one Create card per goal the owner
 * picked, with the plain reason it fits. Keys are GOAL_CHIPS strings; ids are catalog
 * card ids the builder opens with ?template=. Prices are left to the shelf so the two
 * never disagree. */
const FIRST_PLAN: Record<string, { id: string; title: string; sub: string; why: string; hue: string; icon: LucideIcon }> = {
  'More customers on slow days': { id: 'slowoffer', title: 'Slow-night offer', sub: 'An email and text to fill quiet days', why: 'The cheapest test you can run on a quiet night', hue: 'nights', icon: Tag },
  'More foot traffic overall': { id: 'gbp', title: 'Polish your Google profile', sub: 'Photos, hours, menu, info fixed', why: 'The first thing most searchers see', hue: 'newfaces', icon: Store },
  'Build local awareness': { id: 'localseo', title: 'Show up in local search', sub: 'Be the answer when neighbors search', why: 'Being found nearby is where awareness starts', hue: 'brand', icon: MapPin },
  'Promote a specific offering': { id: 'launch', title: 'Launch a special', sub: 'A photo, posts, an email, a Google post', why: 'One item, one week, everywhere at once', hue: 'announce', icon: Tag },
  'Grow social following': { id: 'reel', title: 'A short video reel', sub: 'A reel for Instagram and TikTok', why: 'Reels reach far more people than posts', hue: 'catering', icon: Video },
  'Improve online reputation': { id: 'reviewsplan', title: 'Boost reviews and rating', sub: 'Review requests set up, plus the first asks', why: 'Asks lift a rating faster than anything', hue: 'reviews', icon: Star },
  'Launch something new': { id: 'launch', title: 'Launch a special', sub: 'A photo, posts, an email, a Google post', why: 'A launch week that people hear about twice', hue: 'announce', icon: Tag },
  'Stay top of mind': { id: 'news', title: 'Monthly newsletter', sub: 'One good email a month, written for you', why: 'Keeps you in their head between visits', hue: 'regulars', icon: Mail },
  'Compete with nearby businesses': { id: 'gbp', title: 'Polish your Google profile', sub: 'Photos, hours, menu, info fixed', why: 'Win the comparison people make on the map', hue: 'newfaces', icon: Store },
  'More bookings or orders': { id: 'friction', title: 'Smooth out ordering', sub: 'The Order button on Google, working', why: 'Every tap should land on you, not an app', hue: 'online', icon: ShoppingCart },
  'Turn first-timers into regulars': { id: 'winback', title: 'Win back quiet guests', sub: 'One email and one text to guests gone quiet', why: 'Regulars who drifted come back first', hue: 'regulars', icon: Heart },
  'Grow catering orders': { id: 'catering', title: 'Promote your catering', sub: 'A styled photo and a post for group orders', why: 'Offices book from a picture', hue: 'catering', icon: Truck },
  'Better photos of my food': { id: 'dish', title: 'Feature a dish', sub: 'A styled photo of your best plate', why: 'One great plate changes the whole look', hue: 'event', icon: Camera },
  'Reach a younger crowd': { id: 'reel', title: 'A short video reel', sub: 'A reel for Instagram and TikTok', why: 'Where a younger crowd actually looks', hue: 'brand', icon: Video },
}
const FALLBACK = ['More foot traffic overall', 'Improve online reputation', 'Promote a specific offering']

export default function StepDone({ bizName, goals = [] }: Props) {
  const router = useRouter()
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

  /* Three cards: one per picked goal, de-duplicated by card, filled from the fallback set. */
  const seen = new Set<string>()
  const plan: Array<(typeof FIRST_PLAN)[string]> = []
  for (const g of [...goals, ...FALLBACK]) {
    const c = FIRST_PLAN[g]
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    plan.push(c)
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
        <div className="text-[12px] mt-3" style={{ color: '#98989d' }}>Nothing starts until you say so.</div>
      </div>
    </>
  )
}
