'use server'

/**
 * Service-delivery matrix data layer (Q1 wk 11, 1.1b).
 *
 * For a client, returns: for each active service, for each recent
 * cycle_month, the count of delivered deliverables vs the expected
 * count from service_expectations.
 *
 * The /admin/services/[clientId] page renders this as a months-by-services
 * grid; the client dashboard card shows the current cycle only.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ServiceMonthRow {
  serviceSlug: string
  displayName: string | null
  cycleMonth: string                          // YYYY-MM-01
  delivered: Record<string, number>           // deliverable_type -> count
  expected: Record<string, number>            // deliverable_type -> count (from expectations)
  totalDelivered: number
  totalExpected: number
}

interface DeliverableRow {
  service_id: string | null
  type: string
  cycle_month: string | null
}

interface ServiceRow {
  id: string
  service_slug: string
  display_name: string | null
}

interface ExpectationRow {
  service_slug: string
  deliverable_type: string
  expected_count_per_month: number
}

/** Returns rows ordered by cycle_month desc, service_slug asc. */
export async function getServiceDeliveryMatrix(
  clientId: string,
  months = 6
): Promise<ServiceMonthRow[]> {
  const admin = createAdminClient()

  const since = new Date()
  since.setMonth(since.getMonth() - (months - 1))
  since.setDate(1)
  const sinceISO = since.toISOString().slice(0, 10)

  const [servicesRes, expectationsRes, deliverablesRes] = await Promise.all([
    admin
      .from('client_services')
      .select('id, service_slug, display_name')
      .eq('client_id', clientId)
      .eq('status', 'active'),
    admin
      .from('service_expectations')
      .select('service_slug, deliverable_type, expected_count_per_month'),
    admin
      .from('deliverables')
      .select('service_id, type, cycle_month')
      .eq('client_id', clientId)
      .gte('cycle_month', sinceISO),
  ])

  const services = (servicesRes.data ?? []) as ServiceRow[]
  const expectations = (expectationsRes.data ?? []) as ExpectationRow[]
  const deliverables = (deliverablesRes.data ?? []) as DeliverableRow[]

  // Index expectations by slug.
  const expectedBySlug = new Map<string, Record<string, number>>()
  for (const e of expectations) {
    const cur = expectedBySlug.get(e.service_slug) ?? {}
    cur[e.deliverable_type] = e.expected_count_per_month
    expectedBySlug.set(e.service_slug, cur)
  }

  // Index deliverables by service.id + cycle_month.
  const deliveredBy = new Map<string, Record<string, number>>()
  for (const d of deliverables) {
    if (!d.service_id || !d.cycle_month) continue
    const key = `${d.service_id}|${d.cycle_month}`
    const cur = deliveredBy.get(key) ?? {}
    cur[d.type] = (cur[d.type] ?? 0) + 1
    deliveredBy.set(key, cur)
  }

  // Generate the rolling month list.
  const cycles: string[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    d.setDate(1)
    cycles.push(d.toISOString().slice(0, 10))
  }

  const rows: ServiceMonthRow[] = []
  for (const cycle of cycles) {
    for (const svc of services) {
      const delivered = deliveredBy.get(`${svc.id}|${cycle}`) ?? {}
      const expected = expectedBySlug.get(svc.service_slug) ?? {}
      const totalDelivered = Object.values(delivered).reduce((s, n) => s + n, 0)
      const totalExpected = Object.values(expected).reduce((s, n) => s + n, 0)
      rows.push({
        serviceSlug: svc.service_slug,
        displayName: svc.display_name,
        cycleMonth: cycle,
        delivered,
        expected,
        totalDelivered,
        totalExpected,
      })
    }
  }

  return rows
}

/** Current-cycle summary for the client dashboard. */
export async function getCurrentCycleSummary(clientId: string) {
  const matrix = await getServiceDeliveryMatrix(clientId, 1)
  return matrix
}
