/**
 * Tiny SVG sparkline chart — no dependencies.
 * Pass an array of numbers and it renders a smooth line with optional fill.
 */

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  fillOpacity?: number
  strokeWidth?: number
  className?: string
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = '#4abd98',
  fillOpacity = 0.15,
  strokeWidth = 1.5,
  className = '',
}: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 2

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: padding + (1 - (v - min) / range) * (height - padding * 2),
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const fillPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: 'block' }}
    >
      {fillOpacity > 0 && (
        <path d={fillPath} fill={color} opacity={fillOpacity} />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on the latest value */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2}
        fill={color}
      />
    </svg>
  )
}
