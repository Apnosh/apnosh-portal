'use client'

/**
 * One graphic-type tile — the shared visual for the order flow's shelf and the
 * store's Graphics browse section (P2). One component so the two surfaces can
 * never drift. Same liquid-glass language as the browse wall: frosted white
 * over the paper grid, a whisper of the group color, the type's own ink
 * illustration at center.
 */

import { Check } from 'lucide-react'
import { DESK } from '@/components/campaigns/desk/ui'
import type { JobSpec } from '@/lib/design/job-registry'
import { JOB_GROUP_META, jobLabelOf } from '@/lib/design/job-registry'
import { BoardArt } from './board-art'

export function JobTile({ job, on, onClick }: {
  job: JobSpec
  /** kept for call-site compat; the glass wash now derives from the group */
  tint?: string
  on?: boolean
  onClick: () => void
}) {
  const dot = JOB_GROUP_META[job.group].dot
  return (
    <button
      type="button" aria-pressed={on ?? false} onClick={onClick}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '10px 6px 9px', borderRadius: 14, cursor: 'pointer', overflow: 'hidden',
        background: `linear-gradient(165deg, ${dot}12, rgba(255,255,255,0.04) 55%), rgba(255,255,255,0.55)`,
        backdropFilter: 'blur(8px) saturate(1.25)',
        WebkitBackdropFilter: 'blur(8px) saturate(1.25)',
        border: `1px solid ${on ? DESK.mint : '#EAE7DE'}`,
        boxShadow: on
          ? `inset 0 1px 0 rgba(255,255,255,0.95), 0 6px 16px rgba(46,154,120,0.22)`
          : 'inset 0 1px 0 rgba(255,255,255,0.95), 0 4px 12px rgba(22,33,28,0.07)',
        transform: on ? 'translateY(-1px)' : undefined,
        transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
        WebkitTapHighlightColor: 'transparent', fontFamily: DESK.body,
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.5) 50%, transparent 58%)',
      }} />
      {job.format === 'carousel' && (
        <span aria-hidden style={{ position: 'absolute', top: 5, left: 5, width: 12, height: 12 }}>
          <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 10, borderRadius: 1.5, border: `1.2px solid ${dot}`, background: '#fff', opacity: 0.55 }} />
          <span style={{ position: 'absolute', top: 2, right: 2.5, width: 8, height: 10, borderRadius: 1.5, border: `1.2px solid ${dot}`, background: '#fff' }} />
        </span>
      )}
      <span aria-hidden style={{ display: 'block', width: 52, position: 'relative' }}>
        <BoardArt id={job.id} dot={dot} />
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink2, lineHeight: 1.2, textAlign: 'center', position: 'relative' }}>{jobLabelOf(job.id)}</span>
      {on && (
        <span style={{ position: 'absolute', top: 5, right: 5, width: 15, height: 15, borderRadius: '50%', background: DESK.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={9} strokeWidth={3.6} />
        </span>
      )}
    </button>
  )
}
