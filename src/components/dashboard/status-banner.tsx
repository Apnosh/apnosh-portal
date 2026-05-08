'use client'

interface StatusBannerProps {
  headline: string
  businessName: string
  pct: string
  up: boolean
}

/**
 * Status banner for the per-metric drilldown pages.
 *
 * Three signal states (was: two), so the headline never contradicts
 * the icon:
 *   - "up"      — clearly improved
 *   - "down"    — clearly declined
 *   - "steady"  — within ±5% (or pct unparseable / ---)
 *
 * Previously a "Holding steady" headline could render with a red
 * down-arrow because the `up` boolean was false even when the change
 * was barely -2%. Now we compute steadiness from the percent itself.
 */
export default function StatusBanner({ headline, businessName, pct, up }: StatusBannerProps) {
  const numericPct = Number(pct.replace(/[^\d.-]/g, ''))
  const isSteady = !Number.isFinite(numericPct) || pct === '---' || Math.abs(numericPct) < 5

  let iconBg: string
  let iconStroke: string
  let pctColor: string
  let arrow: 'up' | 'down' | 'flat'

  if (isSteady) {
    iconBg = 'var(--db-border, #e5e5e5)'
    iconStroke = 'var(--db-ink-3, #888)'
    pctColor = 'var(--db-ink-3, #888)'
    arrow = 'flat'
  } else if (up) {
    iconBg = 'var(--db-up-bg)'
    iconStroke = 'var(--db-up)'
    pctColor = 'var(--db-up)'
    arrow = 'up'
  } else {
    iconBg = 'var(--db-down-bg)'
    iconStroke = 'var(--db-down)'
    pctColor = 'var(--db-down)'
    arrow = 'down'
  }

  return (
    <div className="flex items-center gap-4 py-6">
      <div
        className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        {arrow === 'up' && (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 16V4M10 4l5 5M10 4L5 9" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {arrow === 'down' && (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M10 16l5-5M10 16L5 11" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {arrow === 'flat' && (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div>
        <div className="text-[20px] font-bold tracking-[-0.3px]" style={{ color: 'var(--db-black)' }}>
          {headline}
        </div>
        <div className="text-[13px]" style={{ color: 'var(--db-ink-3)' }}>
          {businessName} &middot;{' '}
          <span style={{ color: pctColor, fontWeight: 600 }}>
            {pct === '---' ? 'no comparable data' : pct}
          </span>{' '}
          last 30 days
        </div>
      </div>
    </div>
  )
}
