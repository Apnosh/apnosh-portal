'use client'

import { useRef, useEffect } from 'react'

interface Props {
  data: number[]
  up: boolean
  startLabel?: string
  endLabel?: string
}

export default function TrendSnapshot({ data, up, startLabel, endLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const min = Math.min(...data) * 0.9
    const max = Math.max(...data) * 1.1
    const range = max - min || 1
    const padTop = 8
    const padBot = 8

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * w,
      y: padTop + (1 - (v - min) / range) * (h - padTop - padBot),
    }))

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    if (up) {
      grad.addColorStop(0, 'rgba(74, 189, 152, 0.15)')
      grad.addColorStop(1, 'rgba(74, 189, 152, 0)')
    } else {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.1)')
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)')
    }

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.strokeStyle = up ? '#4abd98' : '#ef4444'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Endpoint dot
    const last = points[points.length - 1]
    ctx.beginPath()
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2)
    ctx.fillStyle = up ? '#4abd98' : '#ef4444'
    ctx.fill()
  }, [data, up])

  if (data.length < 2) return null

  return (
    <div className="rounded-xl p-4" style={{ background: 'white', border: '1px solid var(--db-border, #f0f0f0)' }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--db-ink-3, #888)' }}>
          30-day trend
        </span>
        <div className="flex gap-4 text-[12px]" style={{ color: 'var(--db-ink-3, #888)' }}>
          {startLabel && <span>{startLabel}</span>}
          {endLabel && <span className="font-semibold" style={{ color: 'var(--db-black, #111)' }}>{endLabel}</span>}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '100px' }}
      />
    </div>
  )
}
