'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  bizName: string
}

export default function StepDone({ bizName }: Props) {
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
    launchConfetti()
  }, [launchConfetti])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-50"
      />
      <div className="text-center py-5">
        <div className="text-6xl mb-4">🎉</div>
        <h2
          className="text-[28px] font-semibold mb-2.5"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Welcome to Apnosh{bizName ? `, ${bizName}` : ''}!
        </h2>
        <p className="text-[15px] font-light leading-relaxed mb-7" style={{ color: '#555' }}>
          Your account is all set. We're reviewing your info and building your content strategy now.
        </p>

        <div className="text-left rounded-[10px] px-4 py-4 mb-6" style={{ background: '#f5f5f2' }}>
          <div className="flex gap-3 text-[13px] py-1.5 leading-relaxed" style={{ color: '#555' }}>
            <span
              className="w-[22px] h-[22px] rounded-full bg-[#4abd98] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
            >
              1
            </span>
            <span>We'll put together a custom content strategy based on everything you shared</span>
          </div>
          <div className="flex gap-3 text-[13px] py-1.5 leading-relaxed" style={{ color: '#555' }}>
            <span
              className="w-[22px] h-[22px] rounded-full bg-[#4abd98] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
            >
              2
            </span>
            <span>Your account manager will reach out to connect your social accounts</span>
          </div>
          <div className="flex gap-3 text-[13px] py-1.5 leading-relaxed" style={{ color: '#555' }}>
            <span
              className="w-[22px] h-[22px] rounded-full bg-[#4abd98] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
            >
              3
            </span>
            <span>Your first content will be ready within a week</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full py-3.5 rounded-[10px] text-white text-base font-semibold transition-all"
          style={{ background: '#4abd98', fontFamily: 'DM Sans, sans-serif' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#2e9a78' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#4abd98' }}
        >
          Go to my dashboard
        </button>
      </div>
    </>
  )
}
