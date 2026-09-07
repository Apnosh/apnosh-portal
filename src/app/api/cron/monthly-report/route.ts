/**
 * Vercel Cron: "your month is ready" — the monthly report, PUSHED.
 *
 * The report at /dashboard/insights/impact has existed for months. The only way to reach it was a
 * banner on Home, and the banner only shows if the owner already opened the app in the first two
 * weeks of the month — so the one person the report is written for, the owner who stopped opening
 * the app, never saw it. This is the leg that reaches them.
 *
 * On the first business day of the month, for every client whose last month has something true to
 * say, one in-app row and one email (category content, so the owner's own Notifications switch
 * decides) with the three lines — what it moved, what they said, what worked — and a link that
 * opens LAST month, not the empty one they are standing in.
 *
 * ONCE PER CLIENT PER MONTH, forever. owner_reports (migration 260) is the dedupe and the row is
 * CLAIMED FIRST: the insert either wins unique (client_id, month) or it conflicts, so two
 * overlapping runs cannot both mail the same owner. Before 260 is applied nothing is sent at all
 * and the run says which SQL is missing — an email with no dedupe behind it is a mailshot.
 *
 * NEVER A NUMBER THE LEDGER DOES NOT HOLD. A chapter with nothing in it says the honest waiting
 * line (src/lib/report/report-sent.ts), the same shape the promises ledger's not_counted state
 * gets. A month with no chapters at all is not emailed: nobody is sent an empty page.
 *
 * Auth: THE CRON_SECRET, ALWAYS — a query param or a bearer token, and nothing else. The
 * vercel-cron user-agent is a header anyone can send, and this route emails owners, so it is not
 * a door (the same rule count-is-in runs on). Vercel sends the secret itself on scheduled runs.
 * `dryRun=1` computes who WOULD be told and writes nothing. `force=1` skips the calendar gate for
 * a manual re-run; the dedupe still holds.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMonthlyReport } from '@/lib/report/build-month'
import { claimReportMonth, hasSomethingToSay, isFirstBusinessDay, monthKey, previousMonth, reportLines } from '@/lib/report/report-sent'
import { getClientLanguage } from '@/lib/i18n/language'
import { notifyClientOwners } from '@/lib/notifications'
import { t } from '@/lib/i18n/t'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET) {
    console.error('[monthly-report] CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = url.searchParams.get('dryRun') === '1'
  const force = url.searchParams.get('force') === '1'
  const onlyClientId = url.searchParams.get('clientId')

  const now = new Date()
  // The schedule runs this on the 1st through the 5th so a weekend cannot skip a month; the gate
  // here is what makes it the FIRST business day and not five emails.
  if (!force && !isFirstBusinessDay(now)) {
    return NextResponse.json({ ok: true, sent: 0, note: 'not the first business day of the month' })
  }

  const { year, month } = previousMonth(now)
  const key = monthKey(year, month)
  const link = `/dashboard/insights/impact?m=${key}`

  const admin = createAdminClient()
  let q = admin.from('clients').select('id, name').neq('status', 'churned')
  if (onlyClientId) q = q.eq('id', onlyClientId)
  const { data: clients, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let sent = 0, quiet = 0, already = 0
  const outcomes: { client: string; sent: boolean; why?: string }[] = []

  for (const c of (clients ?? []) as { id: string; name: string }[]) {
    const report = await buildMonthlyReport(admin, c.id, year, month).catch(() => null)
    if (!report || !hasSomethingToSay(report)) {
      quiet += 1
      outcomes.push({ client: c.name, sent: false, why: 'nothing to report' })
      continue
    }
    if (dryRun) { sent += 1; outcomes.push({ client: c.name, sent: false, why: 'dry run' }); continue }

    // CLAIM FIRST, THEN SEND. An email sent and not stamped is an email sent twice tomorrow.
    const claim = await claimReportMonth(admin, c.id, key)
    if (claim === 'no-table') {
      return NextResponse.json({
        ok: false,
        sent,
        error: 'owner_reports is missing (apply migration 260). Nothing was sent, so nobody gets the same report twice.',
      }, { status: 500 })
    }
    if (claim === 'already') { already += 1; outcomes.push({ client: c.name, sent: false, why: 'already sent' }); continue }
    if (claim === 'failed') { outcomes.push({ client: c.name, sent: false, why: 'could not claim the month' }); continue }

    const lang = await getClientLanguage(c.id).catch(() => 'en' as const)
    const monthLabel = new Date(Date.UTC(year, month - 1, 1))
      .toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', timeZone: 'UTC' })
    const body = reportLines(report)
      .map((l) => t(l.key, lang, l.vars))
      .join('\n')

    await notifyClientOwners(c.id, {
      kind: 'report_ready',
      title: t('Your {month} is ready', lang, { month: monthLabel }),
      body,
      link,
      // Worth a phone buzzing: it is the one page a month that says what they got for their money.
      email: true,
      emailCategory: 'content',
    }).catch(() => ({ notified: 0 }))

    sent += 1
    outcomes.push({ client: c.name, sent: true })
  }

  return NextResponse.json({ ok: true, dryRun, month: key, sent, quiet, already, outcomes: outcomes.slice(0, 50) })
}
