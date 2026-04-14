'use client'

import type { InsightIcon } from '@/types/dashboard'

interface InsightCardProps {
  icon: InsightIcon
  title: string
  subtitle: string
}

const ICONS: Record<InsightIcon, React.ReactNode> = {
  star: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.5 3.5 3.5.5-2.5 2.5.5 3.5L8 10.5 5 12l.5-3.5L3 6l3.5-.5z" />
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 2" />
    </svg>
  ),
  map: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2a4 4 0 0 1 4 4c0 3-4 8-4 8S4 9 4 6a4 4 0 0 1 4-4z" />
      <circle cx="8" cy="6" r="1.5" />
    </svg>
  ),
}

export default function InsightCard({ icon, title, subtitle }: InsightCardProps) {
  return (
    <div
      className="flex items-start gap-3.5 rounded-[14px] p-4"
      style={{ background: 'var(--db-bg-2)' }}
    >
      <div
        className="w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--db-up-bg)', color: 'var(--db-up)' }}
      >
        {ICONS[icon]}
      </div>
      <div className="text-[14px] leading-[1.55]" style={{ color: 'var(--db-ink-2)' }}>
        <strong style={{ color: 'var(--db-black)' }}>{title}</strong> &mdash; {subtitle}
      </div>
    </div>
  )
}
