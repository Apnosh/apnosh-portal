/**
 * /dashboard/insights/impact — the monthly report. This is the page the
 * monthly-recap notification has always linked to; it now exists. Current
 * month reads "so far" and seals on the 1st; ?m=YYYY-MM opens a past month.
 *
 * THE EMAIL'S OWN LINK carries ?src=email, and that is the only thing that stamps the open on the
 * owner_reports row for that client and month (migration 260). ?m= alone is not enough: the Home
 * banner, the review nudge and an owner paging back through old months all carry ?m=, and every
 * one of them used to be recorded as "they opened the report we pushed". Staff never stamp either
 * — admin AND super_admin (src/lib/auth/roles.ts) — because a strategist opening a client's report
 * is not the owner reading it. Best-effort: a stamp is never worth a broken page.
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

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ m?: string; src?: string; clientId?: string }> }) {
  const { m, src, clientId: clientIdParam } = await searchParams
  /* the shared resolver: an owner gets their business, an admin the client picked in the switcher */
  const { user, clientId, isStaff } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) redirect('/dashboard')

  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1
  const askedMonth = !!m && /^\d{4}-\d{2}$/.test(m)
  const fromEmail = askedMonth && src === 'email'
  if (askedMonth) {
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
  if (fromEmail && !isStaff) {
    await stampReportOpened(admin, clientId, monthKey(year, month))
  }

  return <ReportView report={report} bizName={(client?.name as string) || 'Your business'} backHref="/dashboard" lang={lang} />
}
