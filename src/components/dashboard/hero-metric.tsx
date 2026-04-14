'use client'

interface HeroMetricProps {
  ctx: string
  num: string
  pctFull: string
  up: boolean
}

export default function HeroMetric({ ctx, num, pctFull, up }: HeroMetricProps) {
  return (
    <div className="mb-6">
      <div className="text-[14px] mb-1" style={{ color: 'var(--db-ink-3)' }}>
        {ctx}
      </div>
      <div
        className="text-[56px] max-sm:text-[42px] font-bold leading-none"
        style={{
          color: 'var(--db-black)',
          letterSpacing: '-2.5px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {num}
      </div>
      <div className="flex items-center gap-2.5 mt-2">
        <div
          className="flex items-center gap-1 text-[14px] font-semibold"
          style={{ color: up ? 'var(--db-up)' : 'var(--db-down)' }}
        >
          {up ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 11V3M7 3l3.5 3.5M7 3L3.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 3v8M7 11l3.5-3.5M7 11L3.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {pctFull}
        </div>
      </div>
    </div>
  )
}
