/**
 * /dashboard/insights/impact — the monthly report. This is the page the
 * monthly-recap notification has always linked to; it now exists. Current
 * month reads "so far" and seals on the 1st; ?m=YYYY-MM opens a past month.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMonthlyReport } from '@/lib/report/build-month'
import ReportView from '@/components/report/report-view'

export const dynamic = 'force-dynamic'

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')
  if (!clientId) redirect('/dashboard')

  const { m } = await searchParams
  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    year = Number(m.slice(0, 4))
    month = Number(m.slice(5, 7))
  }

  const admin = createAdminClient()
  const [{ data: client }, report] = await Promise.all([
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    buildMonthlyReport(admin, clientId, year, month),
  ])

  return <ReportView report={report} bizName={(client?.name as string) || 'Your business'} backHref="/dashboard" />
}
