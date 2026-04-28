'use client'

/**
 * Closure form for the unified updates system.
 *
 * Supports both planned closures (holidays, vacations) and emergency
 * closures (power outage, weather, family emergency). Date range is
 * required; reason + customer message are optional but encouraged.
 *
 * On publish, this writes to gbp_locations.special_hours (closing the
 * location for the date range) AND fans out announcements to GBP /
 * IG / FB / email to give customers a heads-up.
 */

import type { ClosurePayload } from '@/lib/updates/types'

interface Props {
  payload: ClosurePayload
  onChange: (next: ClosurePayload) => void
}

export default function ClosureForm({ payload, onChange }: Props) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-2">Closure details</label>

      {/* Kind toggle */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => onChange({ ...payload, kind: 'planned' })}
          className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
            payload.kind === 'planned'
              ? 'bg-ink text-white border-ink'
              : 'bg-white text-ink-3 border-ink-5 hover:border-ink-4'
          }`}
        >
          Planned (holiday, vacation, private event)
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...payload, kind: 'emergency' })}
          className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
            payload.kind === 'emergency'
              ? 'bg-red-500 text-white border-red-500'
              : 'bg-white text-ink-3 border-ink-5 hover:border-ink-4'
          }`}
        >
          Emergency (power, weather, family)
        </button>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Closes</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.starts_at)}
            onChange={e => onChange({ ...payload, starts_at: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-ink-3 block mb-1">Reopens</label>
          <input
            type="datetime-local"
            value={toLocalInput(payload.ends_at)}
            onChange={e => onChange({ ...payload, ends_at: fromLocalInput(e.target.value) })}
            className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
          />
        </div>
      </div>

      {/* Reason (internal) */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-ink-3 block mb-1">
          Reason {payload.kind === 'emergency' ? '(emergency type)' : '(internal note)'}
        </label>
        <input
          type="text"
          value={payload.reason}
          placeholder={payload.kind === 'emergency' ? 'Power outage' : 'Christmas Eve'}
          onChange={e => onChange({ ...payload, reason: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
        />
      </div>

      {/* Customer-facing message */}
      <div>
        <label className="text-[10px] font-medium text-ink-3 block mb-1">
          Customer message <span className="text-ink-4">(used for IG / FB / email)</span>
        </label>
        <textarea
          value={payload.customer_message ?? ''}
          placeholder={
            payload.kind === 'emergency'
              ? 'We are temporarily closed due to a power outage. We will reopen as soon as possible. Thanks for your patience.'
              : 'We are closed for the holiday. See you when we reopen!'
          }
          rows={3}
          onChange={e => onChange({ ...payload, customer_message: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg resize-none"
        />
        <p className="text-[10px] text-ink-4 mt-1">
          Leave blank to let AI draft a default message based on the reason.
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function toLocalInput(iso: string): string {
  if (!iso) return ''
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no timezone
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string {
  if (!local) return ''
  // Input gives us local-time string; convert to ISO
  const d = new Date(local)
  if (isNaN(d.getTime())) return ''
  return d.toISOString()
}
