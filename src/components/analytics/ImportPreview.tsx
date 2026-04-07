'use client'

import type { GBPMetricField } from '@/types/database'
import { GBP_METRIC_LABELS } from '@/types/database'
import { formatMonth } from '@/lib/gbp-data'

interface PreviewRow {
  month: number
  year: number
  [key: string]: number
}

interface ImportPreviewProps {
  rows: PreviewRow[]
  activeMetrics: GBPMetricField[]
  onConfirm: () => void
  onCancel: () => void
  saving?: boolean
}

export function ImportPreview({ rows, activeMetrics, onConfirm, onCancel, saving }: ImportPreviewProps) {
  const visibleMetrics = activeMetrics.filter(m =>
    rows.some(r => (r[m] ?? 0) > 0)
  )

  return (
    <div className="space-y-4">
      <div className="text-sm text-ink-3">
        Preview of {rows.length} month{rows.length !== 1 ? 's' : ''} of data to import.
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-2/60">
              <th className="text-left px-3 py-2 font-medium text-ink-3">Period</th>
              {visibleMetrics.map(m => (
                <th key={m} className="text-right px-3 py-2 font-medium text-ink-3 whitespace-nowrap">
                  {GBP_METRIC_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-ink-6">
                <td className="px-3 py-2 font-medium text-ink-2">
                  {formatMonth(row.month, row.year)}
                </td>
                {visibleMetrics.map(m => (
                  <td key={m} className="text-right px-3 py-2 text-ink-3 tabular-nums">
                    {(row[m] ?? 0).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-ink-6 text-ink-3 text-sm font-medium hover:bg-white/50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Importing...' : `Import ${rows.length} month${rows.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
