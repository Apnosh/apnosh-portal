/**
 * Vercel Cron: "your month is ready" — the monthly report, PUSHED.
 *
 * The report at /dashboard/insights/impact has existed for months. The only way to reach it was a
 * banner on Home, and the banner only shows if the owner already opened the app in the first two
 * weeks of the month — so the one person the report is written for, the owner who stopped opening
 * the app, never saw it. This is the leg that reaches them.
 *
 * On every business day of the first five, for every client whose last month has something true to
 * say, one in-app row and one email (category content, so the owner's own Notifications switch
 * decides) with the three lines — what it moved, what they said, what worked — and a link that
 * opens LAST month, not the empty one they are standing in.
 *
 * ONCE PER CLIENT PER MONTH, forever. owner_reports (migration 260) is the dedupe and the row is
 * CLAIMED FIRST: the insert either wins unique (client_id, month) or it conflicts, so two
 * overlapping runs cannot both mail the same owner. Before 260 is applied nothing is sent at all
 * and the run says which SQL is missing — an email with no dedupe behind it is a mailshot.
 *
 * AND THE CLAIM IS ALSO THE WORK LIST. The run reads this month's rows first and works only on
 * the clients that have none. That is what makes five sending days one email: the 1st does the
 * work, the 2nd finds almost everybody already claimed and does nothing for them. It is also what
 * makes a RETRY real — a month given back because nobody could be told, or never claimed because
 * the numbers could not be read, is simply unclaimed again tomorrow. With one sending day a month
 * (the old gate) tomorrow was thirty days away, and those clients were skipped in silence.
 *
 * A CLIENT WE COULD NOT READ IS NOT A QUIET CLIENT. A failed read is counted as `unreadable` and
 * never claimed, so it is tried again rather than filed as "nothing to report".
 *
 * SIXTY SECONDS IS SIXTY SECONDS. maxDuration is 60 and the loop used to be every client, one
 * after another, with no ceiling: a run that timed out halfway left the rest of the list untold
 * and said nothing about it. So the run takes at most PER_RUN clients, ten at a time, and answers
 * with `remaining` — how many are still waiting. Tomorrow's run takes them.
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
import { buildMonthlyReport, type MonthlyReport } from '@/lib/report/build-month'
import { claimReportMonth, clientsToProcess, hasSomethingToSay, inBatches, isReportDay, monthKey, previousMonth, releaseReportMonth, reportLines } from '@/lib/report/report-sent'
import { getClientLanguage } from '@/lib/i18n/language'
import { notifyClientOwners } from '@/lib/notifications'
import { t } from '@/lib/i18n/t'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

/** How many clients one run will take. The rest come back as `remaining` and wait for tomorrow. */
const PER_RUN = 60
/** How many of those go at once. Ten emails in flight is plenty; sixty is a thundering herd. */
const AT_A_TIME = 10

/** What happened to one client, in the words the run's totals are counted in. */
type Outcome = {
  client: string
  sent: boolean
  why?: string
  bucket: 'sent' | 'quiet' | 'already' | 'failed' | 'unreadable' | 'no-table' | 'claim-failed'
}

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
  // The schedule runs this on the 1st through the 5th so a weekend cannot skip a month, and every
  // one of those days may send — the owner_reports row, not the calendar, is what stops a second
  // email. That is what gives a month nobody could be told about a second chance.
  if (!force && !isReportDay(now)) {
    return NextResponse.json({ ok: true, sent: 0, note: 'outside the first five days of the month' })
  }

  const { year, month } = previousMonth(now)
  const key = monthKey(year, month)
  // src=email is what the page stamps the open on. Only this link carries it: the Home banner and
  // the owner paging back through old months are not "they opened what we sent".
  const link = `/dashboard/insights/analyst?m=${key}&src=email`

  const admin = createAdminClient()
  let q = admin.from('clients').select('id, name').neq('status', 'churned')
  if (onlyClientId) q = q.eq('id', onlyClientId)
  const { data: clients, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // WHO ALREADY HAS THIS MONTH. One read, before any work: building a report is the expensive
  // part, and on day two almost everybody is already told.
  const { data: claimedRows, error: claimedErr } = await admin
    .from('owner_reports').select('client_id').eq('month', key)
  if (claimedErr) {
    if (claimedErr.code === '42P01' || claimedErr.code === 'PGRST205') {
      return NextResponse.json({
        ok: false,
        sent: 0,
        error: 'owner_reports is missing (apply migration 260). Nothing was sent, so nobody gets the same report twice.',
      }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: claimedErr.message }, { status: 500 })
  }
  const claimed = new Set(((claimedRows ?? []) as { client_id: string }[]).map((r) => String(r.client_id)))

  const { batch, already: alreadyTold, remaining } = clientsToProcess(
    (clients ?? []) as { id: string; name: string }[], claimed, PER_RUN,
  )

  let sent = 0, quiet = 0, already = alreadyTold, failed = 0, unreadable = 0
  const outcomes: Outcome[] = []
  let noTable = false

  /** One client, end to end. Returns what happened; it never throws. */
  const one = async (c: { id: string; name: string }): Promise<Outcome> => {
    // A READ THAT FAILED IS NOT A QUIET MONTH. Both used to end up in the same bucket, so a run
    // whose reads were all timing out reported a page of "nothing to report" and looked healthy.
    // A client we could not read is not claimed either: the month stays free to try again.
    let report: MonthlyReport | null = null
    try {
      report = await buildMonthlyReport(admin, c.id, year, month)
    } catch (e) {
      console.warn('[monthly-report] could not read the month for', c.id, (e as Error)?.message)
      return { client: c.name, sent: false, why: 'could not read the month', bucket: 'unreadable' }
    }
    if (!report || !hasSomethingToSay(report)) {
      return { client: c.name, sent: false, why: 'nothing to report', bucket: 'quiet' }
    }
    if (dryRun) return { client: c.name, sent: false, why: 'dry run', bucket: 'sent' }

    // CLAIM FIRST, THEN SEND. An email sent and not stamped is an email sent twice tomorrow.
    const claim = await claimReportMonth(admin, c.id, key)
    if (claim === 'no-table') return { client: c.name, sent: false, why: 'owner_reports is missing', bucket: 'no-table' }
    // Another run took it between our read above and here. Not a failure: the owner is told once.
    if (claim === 'already') return { client: c.name, sent: false, why: 'already sent', bucket: 'already' }
    if (claim === 'failed') return { client: c.name, sent: false, why: 'could not claim the month', bucket: 'claim-failed' }

    const lang = await getClientLanguage(c.id).catch(() => 'en' as const)
    const monthLabel = new Date(Date.UTC(year, month - 1, 1))
      .toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', timeZone: 'UTC' })
    const body = reportLines(report)
      .map((l) => t(l.key, lang, l.vars))
      .join('\n')

    const told = await notifyClientOwners(c.id, {
      kind: 'report_ready',
      title: t('Your {month} is ready', lang, { month: monthLabel }),
      body,
      link,
      // Worth a phone buzzing: it is the one page a month that says what they got for their money.
      email: true,
      emailCategory: 'content',
    }).catch(() => ({ notified: 0 }))

    // NOBODY TOLD MEANS THE MONTH IS STILL FREE. The claim was taken before the send, so a client
    // whose notify threw (or who has no owner row to send to) would have kept a month that was
    // never delivered. Give it back — the next run inside the window picks it up — and count it
    // apart from the sends: a run that says "sent 12" while three went nowhere hides the failure.
    if (!told || told.notified === 0) {
      await releaseReportMonth(admin, c.id, key)
      return { client: c.name, sent: false, why: 'nobody could be told; the month was given back', bucket: 'failed' }
    }
    return { client: c.name, sent: true, bucket: 'sent' }
  }

  for (const run of inBatches(batch, AT_A_TIME)) {
    const results = await Promise.all(run.map(one))
    for (const r of results) {
      outcomes.push(r)
      if (r.bucket === 'sent') sent += 1
      else if (r.bucket === 'quiet') quiet += 1
      else if (r.bucket === 'already') already += 1
      else if (r.bucket === 'failed') failed += 1
      else if (r.bucket === 'unreadable') unreadable += 1
      else if (r.bucket === 'no-table') noTable = true
    }
    // The table went away under us. Stop rather than keep trying to mail with no dedupe behind it.
    if (noTable) {
      return NextResponse.json({
        ok: false,
        sent,
        error: 'owner_reports is missing (apply migration 260). Nothing more was sent, so nobody gets the same report twice.',
      }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true, dryRun, month: key,
    sent, quiet, already, failed, unreadable,
    // How many clients this run did not reach. Tomorrow's run (still inside the window) takes them.
    remaining,
    outcomes: outcomes.slice(0, 50),
  })
}
