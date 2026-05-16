'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { updateWishStatus, type WishRow } from '@/lib/admin/agent-wishes'

const STATUSES = ['reviewed', 'in_roadmap', 'duplicate', 'wont_build'] as const
type Status = typeof STATUSES[number]

const CATEGORY_SUGGESTIONS = [
  'new_tool', 'new_integration', 'new_page_type', 'better_response',
  'scheduling', 'social_media', 'email_sms', 'pos_integration',
  'design_change', 'analytics', 'reporting', 'other',
]

export default function WishRows({ initial }: { initial: WishRow[] }) {
  const [rows, setRows] = useState(initial)
  const [pending, startTransition] = useTransition()

  function handleStatus(id: string, status: Status) {
    startTransition(async () => {
      const res = await updateWishStatus({ id, status })
      if (res.success) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, status, reviewedAt: new Date().toISOString() } : r))
      }
    })
  }
  function handleCategory(id: string, category: string) {
    startTransition(async () => {
      const res = await updateWishStatus({ id, status: 'reviewed', category })
      if (res.success) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, category, status: 'reviewed', reviewedAt: new Date().toISOString() } : r))
      }
    })
  }

  return (
    <div className="space-y-3">
      {rows.map(w => (
        <div key={w.id} className="bg-white rounded-xl border border-ink-6 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] font-medium text-ink">{w.clientName}</span>
                {w.isBeta && (
                  <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                    beta
                  </span>
                )}
                <span className="text-[11px] text-ink-4">·</span>
                <span className="text-[11px] text-ink-3">{relTime(w.createdAt)}</span>
                <span className="text-[11px] text-ink-4">·</span>
                <TriggerChip kind={w.triggerKind} />
                {w.category && (
                  <>
                    <span className="text-[11px] text-ink-4">·</span>
                    <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-bg-2 text-ink-3 font-mono">
                      {w.category}
                    </span>
                  </>
                )}
                {w.status !== 'new' && (
                  <>
                    <span className="text-[11px] text-ink-4">·</span>
                    <StatusChip status={w.status} />
                  </>
                )}
              </div>
              <div className="mt-2 text-[13.5px] text-ink whitespace-pre-wrap">{w.wishText}</div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <select
                  defaultValue={w.category ?? ''}
                  onChange={e => e.target.value && handleCategory(w.id, e.target.value)}
                  disabled={pending}
                  className="text-[11px] font-medium px-2 py-1 rounded-full border border-ink-6 bg-white text-ink-3 hover:text-ink"
                >
                  <option value="">Tag category...</option>
                  {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatus(w.id, s)}
                    disabled={pending || w.status === s}
                    className={[
                      'text-[11px] font-medium px-2 py-1 rounded-full',
                      w.status === s ? 'bg-brand text-white' : 'bg-bg-2 text-ink-3 hover:bg-ink-6 hover:text-ink-2',
                    ].join(' ')}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
                {pending && <Loader2 className="w-3 h-3 animate-spin text-ink-4" />}
                {!pending && w.reviewedAt && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TriggerChip({ kind }: { kind: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    escalation: { label: 'escalation', color: 'bg-amber-50 text-amber-700' },
    cancel_not_what_i_asked: { label: 'wrong action', color: 'bg-rose-50 text-rose-700' },
    cancel_other: { label: 'other cancel', color: 'bg-ink-7 text-ink-3' },
    manual: { label: 'manual', color: 'bg-bg-2 text-ink-3' },
  }
  const m = meta[kind] ?? { label: kind, color: 'bg-bg-2 text-ink-3' }
  return (
    <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ${m.color}`}>
      {m.label}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const meta: Record<string, string> = {
    reviewed: 'bg-bg-2 text-ink-3',
    in_roadmap: 'bg-emerald-50 text-emerald-700',
    duplicate: 'bg-ink-7 text-ink-3',
    wont_build: 'bg-rose-50 text-rose-700',
  }
  return (
    <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ${meta[status] ?? 'bg-bg-2 text-ink-3'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function relTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
