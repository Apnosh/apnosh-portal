'use client'

import { useState } from 'react'
import { METRIC_FIELDS } from '@/lib/gbp-data'
import type { GBPMetricField } from '@/types/database'

interface ColumnMapperProps {
  headers: string[]
  initialMapping: Record<string, GBPMetricField | '__skip'>
  onSave: (mapping: Record<string, GBPMetricField | '__skip'>) => void
  saving?: boolean
}

export function ColumnMapper({ headers, initialMapping, onSave, saving }: ColumnMapperProps) {
  const [mapping, setMapping] = useState(initialMapping)

  return (
    <div className="space-y-4">
      <div className="text-sm text-ink-3 mb-2">
        Map each column from your spreadsheet to a GBP metric, or skip columns you don't need.
      </div>
      <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-1">
        {headers.map(header => (
          <div key={header} className="flex items-center gap-3 p-3 rounded-xl bg-white/50 border border-white/70">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-ink truncate block">{header}</span>
            </div>
            <select
              value={mapping[header] || '__skip'}
              onChange={e => setMapping(prev => ({ ...prev, [header]: e.target.value as GBPMetricField | '__skip' }))}
              className="text-sm bg-white border border-ink-6 rounded-lg px-3 py-1.5 text-ink-2 min-w-[160px]"
            >
              {METRIC_FIELDS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSave(mapping)}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Confirm mapping'}
      </button>
    </div>
  )
}
