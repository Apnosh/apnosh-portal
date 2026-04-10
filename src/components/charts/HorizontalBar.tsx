/**
 * Labeled horizontal bar chart — pure SVG, no dependencies.
 * Used for demographics (cities, ages) and engagement breakdown.
 */

interface BarItem {
  label: string
  value: number
  color?: string
}

interface HorizontalBarProps {
  items: BarItem[]
  maxItems?: number
  barHeight?: number
  className?: string
  showPercentage?: boolean
}

export function HorizontalBar({
  items,
  maxItems = 6,
  barHeight = 24,
  className = '',
  showPercentage = false,
}: HorizontalBarProps) {
  const visible = items.slice(0, maxItems)
  if (visible.length === 0) return null

  const maxVal = Math.max(...visible.map(i => i.value), 1)
  const total = visible.reduce((s, i) => s + i.value, 0)

  return (
    <div className={`space-y-2 ${className}`}>
      {visible.map((item, i) => {
        const pct = (item.value / maxVal) * 100
        const totalPct = total > 0 ? Math.round((item.value / total) * 100) : 0
        return (
          <div key={item.label + i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-ink-2 truncate">{item.label}</span>
              <span className="text-xs font-medium text-ink-2 ml-2 flex-shrink-0">
                {item.value.toLocaleString()}
                {showPercentage && <span className="text-ink-4 ml-1">({totalPct}%)</span>}
              </span>
            </div>
            <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color || '#4abd98',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Stacked horizontal bar — shows composition of a total.
 * Used for engagement breakdown (likes vs comments vs shares vs saves).
 */

export interface StackedSegment {
  label: string
  value: number
  color: string
}

interface StackedBarProps {
  segments: StackedSegment[]
  height?: number
  className?: string
}

export function StackedBar({
  segments,
  height = 12,
  className = '',
}: StackedBarProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  return (
    <div className={className}>
      <div className="flex rounded-full overflow-hidden" style={{ height }}>
        {segments.map((seg, i) => {
          const pct = (seg.value / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={seg.label}
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${seg.value.toLocaleString()} (${Math.round(pct)}%)`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-2.5">
        {segments.map(seg => {
          if (seg.value === 0) return null
          const pct = Math.round((seg.value / total) * 100)
          return (
            <div key={seg.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[11px] text-ink-3">
                {seg.label} <span className="font-medium text-ink-2">{seg.value.toLocaleString()}</span>
                <span className="text-ink-4 ml-0.5">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
