/**
 * /admin/services/[clientId] — service-delivery matrix per client.
 *
 * Q1 wk 11 (1.1b). One row per active service, columns are recent
 * cycle months. Each cell shows delivered/expected. Click a cell to
 * jump to the deliverables filtered by service + cycle.
 *
 * This is the page strategists pull up during retention conversations:
 * "here's what we delivered against what your plan promised."
 */

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getServiceDeliveryMatrix } from '@/lib/services/delivery-matrix'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function deliveryTone(delivered: number, expected: number): string {
  if (expected === 0) return 'text-ink-3'
  const ratio = delivered / expected
  if (ratio >= 1) return 'text-emerald-700'
  if (ratio >= 0.7) return 'text-amber-700'
  return 'text-red-700'
}

export default async function ServiceMatrixPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto text-center text-ink-3">
        Client not found.
      </div>
    )
  }

  const matrix = await getServiceDeliveryMatrix(clientId, 6)

  // Pivot: services as rows, cycles as columns.
  const services = Array.from(new Set(matrix.map(r => r.serviceSlug)))
  const cycles = Array.from(new Set(matrix.map(r => r.cycleMonth))).sort().reverse()
  const cellByKey = new Map<string, typeof matrix[number]>()
  for (const r of matrix) cellByKey.set(`${r.serviceSlug}|${r.cycleMonth}`, r)

  return (
    <div className="px-6 py-8 max-w-[1280px] mx-auto">
      <Link
        href={`/admin/today?clientId=${clientId}`}
        className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink mb-3"
      >
        <ChevronLeft className="w-3 h-3" /> Back to {client.name}
      </Link>

      <h1 className="text-2xl font-bold text-ink">Service delivery</h1>
      <p className="text-sm text-ink-3 mt-1 mb-6">
        Last 6 months. Numbers are delivered / expected per cycle.
      </p>

      {services.length === 0 ? (
        <div className="text-center py-12 text-ink-3 text-sm border border-dashed border-ink-6 rounded-xl">
          No active services for this client.
        </div>
      ) : (
        <div className="border border-ink-6 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-7 text-ink-3 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Service</th>
                {cycles.map(c => (
                  <th key={c} className="text-left px-3 py-2.5 font-semibold">
                    {fmtMonth(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-6">
              {services.map(slug => {
                const display =
                  cellByKey.get(`${slug}|${cycles[0]}`)?.displayName ?? slug
                return (
                  <tr key={slug}>
                    <td className="px-4 py-3 font-semibold text-ink">{display}</td>
                    {cycles.map(c => {
                      const cell = cellByKey.get(`${slug}|${c}`)
                      if (!cell) {
                        return (
                          <td key={c} className="px-3 py-3 text-ink-4">—</td>
                        )
                      }
                      const tone = deliveryTone(cell.totalDelivered, cell.totalExpected)
                      return (
                        <td key={c} className="px-3 py-3">
                          <span className={`text-sm font-semibold ${tone}`}>
                            {cell.totalDelivered}
                            {cell.totalExpected > 0 && (
                              <span className="text-ink-4 font-normal">
                                {' '}/ {cell.totalExpected}
                              </span>
                            )}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
