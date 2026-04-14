'use client'

import { useRef, useEffect } from 'react'

interface SparklineProps {
  data: number[]
  up: boolean
  height?: number
}

export default function Sparkline({ data, up, height = 36 }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !data.length) return

    const w = c.offsetWidth || 120
    c.width = w
    c.height = height
    const ctx = c.getContext('2d')
    if (!ctx) return

    const mn = Math.min(...data)
    const mx = Math.max(...data)
    const range = mx - mn || 1

    ctx.clearRect(0, 0, w, height)

    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * (w - 2) + 1,
      y: height - ((v - mn) / range) * 26 - 5,
    }))

    // Filled area
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.lineTo(pts[pts.length - 1].x, height)
    ctx.lineTo(pts[0].x, height)
    ctx.closePath()
    ctx.fillStyle = up ? 'rgba(0,200,5,0.06)' : 'rgba(255,80,0,0.06)'
    ctx.fill()

    // Line
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.strokeStyle = up ? '#00C805' : '#FF5000'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [data, up, height])

  return <canvas ref={canvasRef} className="w-full mt-3" style={{ height }} />
}
