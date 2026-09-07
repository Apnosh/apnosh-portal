/**
 * /dashboard/insights/impact — the monthly report. This is the page the
 * monthly-recap notification has always linked to; it now exists. Current
 * month reads "so far" and seals on the 1st; ?m=YYYY-MM opens a past month.
 *
 * ?m= is also the email's link, so arriving with one is how we learn the pushed report was READ:
 * the open is stamped on the owner_reports row for that client and month (migration 260), which
 * only exists if the email actually went out. Best-effort — a stamp is never worth a broken page —
 * and skipped for staff, because a strategist opening a client's report is not the owner reading it.
 *
 * The language is read here, on the server, and handed down: a Spanish owner never sees a frame of
 * English while the browser catches up.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMonthlyReport } from '@/lib/report/build-month'
import { monthKey, stampReportOpened } from '@/lib/report/report-sent'
import { getClientLanguage } from '@/lib/i18n/language'
import ReportView from '@/components/report/report-view'

export const dynamic = 'force-dynamic'

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ m?: string; clientId?: string }> }) {
  const { m, clientId: clientIdParam } = await searchParams
  /* the shared resolver: an owner gets their business, an admin the client picked in the switcher */
  const { user, clientId, isAdmin } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) redirect('/dashboard')

  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1
  const fromEmail = !!m && /^\d{4}-\d{2}$/.test(m)
  if (fromEmail) {
    year = Number(m!.slice(0, 4))
    month = Number(m!.slice(5, 7))
  }

  const admin = createAdminClient()
  const [{ data: client }, report, lang] = await Promise.all([
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    buildMonthlyReport(admin, clientId, year, month),
    getClientLanguage(clientId),
  ])

  // They followed the email. Staff looking at somebody else's report is not the owner reading it.
  if (fromEmail && !isAdmin) {
    await stampReportOpened(admin, clientId, monthKey(year, month))
  }

  return <ReportView report={report} bizName={(client?.name as string) || 'Your business'} backHref="/dashboard" lang={lang} />
}
