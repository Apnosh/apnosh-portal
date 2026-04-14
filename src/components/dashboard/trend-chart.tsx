'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import type { TimeRange, ChartData } from '@/types/dashboard'

Chart.register(...registerables)

interface TrendChartProps {
  data: Record<TimeRange, ChartData>
  timeRange: TimeRange
  onTimeRangeChange: (tr: TimeRange) => void
  up: boolean
  unit: string
}

const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', '1Y']

function fmtY(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toString()
}

export default function TrendChart({ data, timeRange, onTimeRangeChange, up, unit }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const crosshairRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipValRef = useRef<HTMLDivElement>(null)
  const tooltipSubRef = useRef<HTMLDivElement>(null)
  const endpointRef = useRef<HTMLDivElement>(null)

  const lineColor = up ? '#00C805' : '#FF5000'

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Destroy existing
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const d = data[timeRange]
    if (!d || !d.data.length) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isUp = up
    const chartLineColor = lineColor

    // Y-axis range
    const rawMin = Math.min(...d.data)
    const rawMax = Math.max(...d.data)
    const range = rawMax - rawMin || 1
    const yFloor = Math.max(0, rawMin - range * 0.3)
    const yCeil = rawMax + range * 0.35

    // Plugin: gradient fill
    const gradientPlugin = {
      id: 'grad',
      beforeDatasetsUpdate(c: Chart) {
        const a = c.chartArea
        if (!a) return
        const g = c.ctx.createLinearGradient(0, a.top, 0, a.bottom)
        if (isUp) {
          g.addColorStop(0, 'rgba(0,200,5,0.18)')
          g.addColorStop(0.5, 'rgba(0,200,5,0.05)')
          g.addColorStop(1, 'rgba(0,200,5,0)')
        } else {
          g.addColorStop(0, 'rgba(255,80,0,0.18)')
          g.addColorStop(0.5, 'rgba(255,80,0,0.05)')
          g.addColorStop(1, 'rgba(255,80,0,0)')
        }
        c.data.datasets[0].backgroundColor = g
      },
    }

    // Plugin: custom Y grid
    const gridPlugin = {
      id: 'yGrid',
      beforeDraw(c: Chart) {
        const a = c.chartArea
        if (!a) return
        const cx = c.ctx
        const niceRange = yCeil - yFloor
        let step = Math.pow(10, Math.floor(Math.log10(niceRange)))
        if (niceRange / step < 3) step = step / 2
        if (niceRange / step > 6) step = step * 2
        const startVal = Math.ceil(yFloor / step) * step

        cx.save()
        cx.font = '11px -apple-system,system-ui,sans-serif'
        cx.fillStyle = '#bbb'
        cx.strokeStyle = 'rgba(0,0,0,0.04)'
        cx.lineWidth = 1

        for (let val = startVal; val <= yCeil; val += step) {
          const yPx = a.bottom - ((val - yFloor) / (yCeil - yFloor)) * a.height
          if (yPx < a.top + 10 || yPx > a.bottom - 10) continue
          cx.beginPath()
          cx.setLineDash([])
          cx.moveTo(a.left, yPx)
          cx.lineTo(a.right, yPx)
          cx.stroke()
          cx.textAlign = 'left'
          cx.textBaseline = 'bottom'
          cx.fillText(fmtY(val), a.left + 2, yPx - 4)
        }
        cx.restore()
      },
    }

    // Plugin: annotations (start + end values)
    const annotPlugin = {
      id: 'annot',
      afterDraw(c: Chart) {
        const a = c.chartArea
        if (!a) return
        const meta = c.getDatasetMeta(0)
        if (!meta.data.length) return
        const cx = c.ctx
        const first = meta.data[0]
        const last = meta.data[meta.data.length - 1]

        cx.save()
        cx.font = '600 12px -apple-system,system-ui,sans-serif'
        cx.fillStyle = '#bbb'
        cx.textAlign = 'left'
        cx.textBaseline = 'bottom'
        cx.fillText(fmtY(d.data[0]), first.x + 4, first.y - 6)

        cx.fillStyle = chartLineColor
        cx.textAlign = 'right'
        cx.fillText(fmtY(d.data[d.data.length - 1]), last.x - 4, last.y - 6)
        cx.restore()
      },
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: d.data.map((_, i) => i.toString()),
        datasets: [
          {
            data: d.data,
            borderColor: chartLineColor,
            borderWidth: 2.5,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeInOutQuart' },
        layout: { padding: { left: 8, right: 80, top: 32, bottom: 8 } },
        scales: {
          x: { display: false },
          y: { display: false, min: yFloor, max: yCeil },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover(e) {
          if (!e.native) return
          const rect = canvas.getBoundingClientRect()
          const x = (e.native as MouseEvent).clientX - rect.left

          const meta = chart.getDatasetMeta(0)
          const result = { px: 0, py: 0, idx: -1, dist: 9999 }

          meta.data.forEach((pt, i) => {
            const dist = Math.abs(pt.x - x)
            if (dist < result.dist) {
              result.dist = dist
              result.px = pt.x
              result.py = pt.y
              result.idx = i
            }
          })

          const dot = dotRef.current
          const tb = tooltipRef.current
          const cross = crosshairRef.current
          const ep = endpointRef.current

          if (result.idx < 0 || result.dist > 80) {
            if (dot) dot.style.display = 'none'
            if (tb) tb.style.display = 'none'
            if (cross) cross.style.display = 'none'
            if (ep) ep.style.display = 'flex'
            return
          }

          if (ep) ep.style.display = 'none'
          if (cross) {
            cross.style.display = 'block'
            cross.style.left = result.px + 'px'
          }
          if (dot) {
            dot.style.display = 'block'
            dot.style.left = result.px + 'px'
            dot.style.top = result.py + 'px'
            dot.style.background = chartLineColor
          }

          const val = d.data[result.idx]
          if (tooltipValRef.current) {
            tooltipValRef.current.textContent = val.toLocaleString() + ' ' + unit
          }
          const prev = result.idx > 0 ? d.data[result.idx - 1] : val
          const pct = prev ? Math.round(((val - prev) / prev) * 100) : 0
          if (tooltipSubRef.current) {
            tooltipSubRef.current.textContent = (pct >= 0 ? '+' : '') + pct + '% from prev'
          }

          if (tb) {
            tb.style.display = 'block'
            const cw = canvas.offsetWidth || 700
            const bx = Math.max(70, Math.min(cw - 70, result.px))
            tb.style.left = bx + 'px'
            tb.style.top = Math.max(4, result.py - 54) + 'px'
            tb.style.transform = 'translateX(-50%)'
          }
        },
      },
      plugins: [gradientPlugin, gridPlugin, annotPlugin],
    })

    // Position endpoint after animation
    const onComplete = () => {
      const meta = chart.getDatasetMeta(0)
      if (!meta.data.length) return
      const last = meta.data[meta.data.length - 1]
      if (endpointRef.current) {
        endpointRef.current.style.left = last.x + 'px'
        endpointRef.current.style.top = last.y + 'px'
        endpointRef.current.style.display = 'flex'
      }
    }

    // Use a timeout to position after first animation
    setTimeout(onComplete, 850)

    chartRef.current = chart
  }, [data, timeRange, up, lineColor, unit])

  // Draw chart on mount / data change
  useEffect(() => {
    drawChart()
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [drawChart])

  // Debounced resize
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const handler = () => {
      clearTimeout(timeout)
      timeout = setTimeout(drawChart, 150)
    }
    window.addEventListener('resize', handler)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', handler)
    }
  }, [drawChart])

  // Mouse leave handler
  const handleMouseLeave = () => {
    if (dotRef.current) dotRef.current.style.display = 'none'
    if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    if (crosshairRef.current) crosshairRef.current.style.display = 'none'
    if (endpointRef.current) endpointRef.current.style.display = 'flex'
  }

  const d = data[timeRange]

  return (
    <div className="pb-10 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
      {/* Time range buttons */}
      <div className="flex gap-1 mb-4">
        {TIME_RANGES.map((tr) => (
          <button
            key={tr}
            onClick={() => onTimeRangeChange(tr)}
            className="text-[12px] font-semibold rounded-md transition-colors"
            style={{
              padding: '5px 12px',
              color: tr === timeRange ? 'var(--db-black)' : 'var(--db-ink-3)',
              background: tr === timeRange ? 'var(--db-bg-3)' : 'transparent',
            }}
          >
            {tr}
          </button>
        ))}
      </div>

      {/* Chart container */}
      <div
        ref={wrapRef}
        className="relative h-[400px] max-sm:h-[220px] max-sm:-mx-2 overflow-hidden"
        style={{ cursor: 'crosshair' }}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} />

        {/* Crosshair line */}
        <div
          ref={crosshairRef}
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{ background: 'var(--db-border)', display: 'none', zIndex: 2 }}
        />

        {/* Tracking dot */}
        <div
          ref={dotRef}
          className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
          style={{
            display: 'none',
            transform: 'translate(-50%,-50%)',
            border: '2px solid white',
            boxShadow: '0 0 6px rgba(0,200,5,0.4)',
            zIndex: 3,
          }}
        />

        {/* Endpoint (pulsing) */}
        <div
          ref={endpointRef}
          className="absolute w-2.5 h-2.5 rounded-full pointer-events-none items-center justify-center"
          style={{
            display: 'none',
            transform: 'translate(-50%,-50%)',
            background: lineColor,
            border: '2px solid white',
            boxShadow: `0 0 6px ${up ? 'rgba(0,200,5,0.4)' : 'rgba(255,80,0,0.4)'}`,
            zIndex: 3,
          }}
        >
          <div
            className="absolute w-7 h-7 rounded-full pointer-events-none"
            style={{
              background: lineColor,
              top: '50%',
              left: '50%',
              animation: 'dbPulse 2.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Tooltip */}
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none rounded-lg"
          style={{
            display: 'none',
            background: '#000',
            padding: '8px 14px',
            zIndex: 4,
          }}
        >
          <div
            ref={tooltipValRef}
            className="text-[15px] font-bold text-white"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          <div ref={tooltipSubRef} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </div>
      </div>

      {/* X-axis labels */}
      {d && (
        <div className="flex justify-between mt-2 px-2">
          {d.labels.map((l, i) => (
            <span key={i} className="text-[11px]" style={{ color: 'var(--db-ink-3)' }}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
