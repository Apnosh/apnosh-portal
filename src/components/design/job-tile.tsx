'use client'

/**
 * One graphic-type tile — the shared visual for the order flow's step-1 shelf
 * and the store's Graphics browse section (P2). One component so the two
 * surfaces can never drift.
 */

import { Check } from 'lucide-react'
import { DESK } from '@/components/campaigns/desk/ui'
import type { JobSpec } from '@/lib/design/job-registry'
import { jobLabelOf } from '@/lib/design/job-registry'

export function JobTile({ job, tint, on, onClick }: {
  job: JobSpec
  /** the group's plate tint behind the emoji */
  tint: string
  on?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button" aria-pressed={on ?? false} onClick={onClick}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '12px 4px 10px', borderRadius: 14, cursor: 'pointer',
        border: `1.5px solid ${on ? DESK.mint : DESK.line}`,
        background: on ? DESK.mintWash : DESK.card,
        boxShadow: on ? '0 4px 14px rgba(46,154,120,0.18)' : '0 1px 3px rgba(22,33,28,0.05)',
        transform: on ? 'translateY(-1px)' : undefined,
        transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease',
        WebkitTapHighlightColor: 'transparent', fontFamily: DESK.body,
      }}
    >
      <span aria-hidden style={{ width: 38, height: 38, borderRadius: 12, background: on ? '#fff' : tint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, transition: 'background .15s ease' }}>
        {job.emoji}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink2, lineHeight: 1.2, textAlign: 'center' }}>{jobLabelOf(job.id)}</span>
      {on && (
        <span style={{ position: 'absolute', top: 5, right: 5, width: 15, height: 15, borderRadius: '50%', background: DESK.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={9} strokeWidth={3.6} />
        </span>
      )}
    </button>
  )
}
