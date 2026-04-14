'use client'

interface StatusBannerProps {
  headline: string
  businessName: string
  pct: string
  up: boolean
}

export default function StatusBanner({ headline, businessName, pct, up }: StatusBannerProps) {
  return (
    <div className="flex items-center gap-4 py-6">
      <div
        className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: up ? 'var(--db-up-bg)' : 'var(--db-down-bg)' }}
      >
        {up ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 16V4M10 4l5 5M10 4L5 9" stroke="var(--db-up)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M10 16l5-5M10 16L5 11" stroke="var(--db-down)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <div className="text-[20px] font-bold tracking-[-0.3px]" style={{ color: 'var(--db-black)' }}>
          {headline}
        </div>
        <div className="text-[13px]" style={{ color: 'var(--db-ink-3)' }}>
          {businessName} &middot;{' '}
          <span style={{ color: up ? 'var(--db-up)' : 'var(--db-down)', fontWeight: 600 }}>
            {pct}
          </span>{' '}
          this month
        </div>
      </div>
    </div>
  )
}
