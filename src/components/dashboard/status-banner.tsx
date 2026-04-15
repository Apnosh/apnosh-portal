'use client'

import type { HealthSignal } from '@/types/dashboard'

interface StatusBannerProps {
  headline: string
  businessName: string
  signal: HealthSignal
  rank?: string
  pct?: string
  up?: boolean
}

const SIGNAL_COLORS: Record<HealthSignal, { bg: string; dot: string }> = {
  green: { bg: 'rgba(74, 189, 152, 0.1)', dot: '#4abd98' },
  amber: { bg: 'rgba(245, 158, 11, 0.1)', dot: '#f59e0b' },
  red: { bg: 'rgba(239, 68, 68, 0.1)', dot: '#ef4444' },
}

export default function StatusBanner({ headline, businessName, signal, rank, pct, up }: StatusBannerProps) {
  const colors = SIGNAL_COLORS[signal]

  return (
    <div className="flex items-start justify-between gap-4 py-6">
      <div className="flex items-center gap-4">
        {/* Signal dot */}
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 mt-2"
          style={{ background: colors.dot, boxShadow: `0 0 8px ${colors.dot}40` }}
        />
        <div>
          <h1
            className="text-[22px] font-bold tracking-[-0.3px] leading-tight"
            style={{ color: 'var(--db-black, #111)', fontFamily: 'var(--font-display, Playfair Display), serif' }}
          >
            {headline}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
            {businessName} &middot; {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {pct && (
              <>
                {' '}&middot;{' '}
                <span style={{ color: up ? 'var(--db-up, #22c55e)' : 'var(--db-down, #ef4444)', fontWeight: 600 }}>
                  {pct}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Rank badge */}
      {rank && (
        <span
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0 mt-1"
          style={{ background: colors.bg, color: colors.dot }}
        >
          {rank}
        </span>
      )}
    </div>
  )
}
