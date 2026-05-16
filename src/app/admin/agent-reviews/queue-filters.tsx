'use client'

import Link from 'next/link'

export default function QueueFilters({
  current, needsReview, reviewed,
}: {
  current: 'needs_review' | 'reviewed' | 'all'
  needsReview: number
  reviewed: number
}) {
  const filters = [
    { id: 'needs_review' as const, label: `Needs review (${needsReview})` },
    { id: 'reviewed' as const, label: `Reviewed (${reviewed})` },
    { id: 'all' as const, label: 'All' },
  ]
  return (
    <div className="flex items-center gap-1 border-b border-ink-6">
      {filters.map(f => (
        <Link
          key={f.id}
          href={`/admin/agent-reviews?filter=${f.id}`}
          className={[
            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            current === f.id ? 'text-ink border-brand' : 'text-ink-3 border-transparent hover:text-ink-2',
          ].join(' ')}
        >
          {f.label}
        </Link>
      ))}
    </div>
  )
}
