/**
 * Vercel Cron: "your count is in".
 *
 * Every order promises one number and a day it shows on Home. Until now nobody was told when that
 * day arrived: the row simply changed on a page the owner had to think to open. So the promise was
 * kept and never delivered — the ninety-day audit's quietest zero.
 *
 * Each morning this finds the promises whose showing day has passed, reads the SAME line the card
 * and Home read (src/lib/promises/read.ts lineFor — there is no second set of words), and sends one
 * in-app notice and one email with the number and a link to the order.
 *
 * AND IT SENDS THE HONEST ONE TOO. A promise the product cannot count (`not_counted`) gets the
 * waiting line, not silence. Being told "we cannot read this number, here is why" on the day you
 * were promised it is the whole difference between a system that keeps promises and one that hopes
 * you forget.
 *
 * ONCE PER PROMISE, forever. order_promises.counted_notified_at (migration 258) is the dedupe. It
 * is STAMPED FIRST and only then sent: the update claims the row (`where counted_notified_at is
 * null`), so two overlapping runs cannot both tell the same owner the same thing, and a notice
 * nobody could send is not retried every morning for the rest of the year. Pre-258 the column is
 * absent: the stamp fails, nothing is sent, and the run says which SQL to apply.
 *
 * Auth: the CRON_SECRET as a query param or a bearer token, or Vercel's own cron user-agent. With
 * no CRON_SECRET set the route refuses to run at all — the user-agent is a header anyone can send,
 * and this route emails owners. `dryRun=1` computes who WOULD be told and writes nothing.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPromiseRows } from '@/lib/promises/read'
import { notifyClientOwners } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

/** The states worth telling somebody about on the day their number was promised. */
const TELLABLE = new Set(['counted', 'not_counted'])

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  // FAIL CLOSED WHEN THERE IS NO SECRET. With CRON_SECRET unset, `querySecret !== CRON_SECRET` is
  // true for a missing param too, so the only door left was the user-agent — a header anyone can
  // send. This route emails every owner whose count is in; an open door on it is a mailshot with
  // somebody else's name on it.
  if (!CRON_SECRET) {
    console.error('[count-is-in] CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = url.searchParams.get('dryRun') === '1'
  const onlyClientId = url.searchParams.get('clientId')

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // The promises whose showing day has come and that nobody has been told about. select('*') so a
  // missing counted_notified_at column (pre-258) does not error the read — it is caught on the
  // stamp instead, where we can say exactly which SQL is missing.
  let q = admin.from('order_promises').select('*').lte('shows_on', today).order('shows_on', { ascending: true }).limit(500)
  if (onlyClientId) q = q.eq('client_id', onlyClientId)
  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const due = ((data ?? []) as Record<string, unknown>[]).filter((r) => !r.counted_notified_at)
  if (!due.length) return NextResponse.json({ ok: true, dryRun, told: 0, skipped: 0, note: 'nothing due' })

  // One read per CLIENT, not per promise: getPromiseRows already computes every row for a client,
  // with the same measurements and the same words the owner sees everywhere else.
  const byClient = new Map<string, Set<string>>()
  for (const r of due) {
    const cid = String(r.client_id ?? '')
    if (!cid) continue
    const set = byClient.get(cid) ?? new Set<string>()
    set.add(String(r.id))
    byClient.set(cid, set)
  }

  let told = 0, skipped = 0, stampFailed = 0
  const outcomes: { clientId: string; promiseId: string; state: string; sent: boolean; why?: string }[] = []

  for (const [clientId, ids] of byClient) {
    // limit 0 = every row, unranked and untrimmed.
    const rows = await getPromiseRows(clientId, 0).catch(() => [])
    for (const row of rows) {
      if (!ids.has(row.id)) continue
      // A promise still counting on its showing day (Google has not reported, no posts went out)
      // is not ready to be announced. Leaving counted_notified_at unset means tomorrow's run
      // picks it up, which is exactly right: the owner hears when there is something to hear.
      if (!TELLABLE.has(row.state)) { skipped++; outcomes.push({ clientId, promiseId: row.id, state: row.state, sent: false, why: 'still counting' }); continue }
      if (dryRun) { told++; outcomes.push({ clientId, promiseId: row.id, state: row.state, sent: false, why: 'dry run' }); continue }

      // STAMP FIRST, THEN SEND. The stamp used to come after the notify, so two runs overlapping
      // (a retry, a manual run beside the scheduled one) both read an unstamped row and both told
      // the same owner the same thing. The update is the claim: `is null` means exactly one run
      // wins it, and only the winner sends. A row we cannot stamp is never sent, because a notice
      // with no dedupe behind it is a mailshot.
      const { data: claimed, error: stampErr } = await admin
        .from('order_promises')
        .update({ counted_notified_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('counted_notified_at', null)
        .select('id')
      if (stampErr) {
        stampFailed++
        console.warn('[count-is-in] could not stamp the notice (apply migration 258):', stampErr.message)
        // Without the stamp there is no dedupe, and a cron with no dedupe tells the same owner the
        // same thing every day. Stop before the first one rather than become a mailshot.
        return NextResponse.json({
          ok: false,
          told,
          error: 'counted_notified_at is missing (apply migration 258). Nothing was sent, so nobody is told the same thing twice.',
        }, { status: 500 })
      }
      if (!claimed || claimed.length === 0) {
        // Another run claimed it a moment ago. Not a failure — the owner is being told once.
        skipped++
        outcomes.push({ clientId, promiseId: row.id, state: row.state, sent: false, why: 'already told' })
        continue
      }

      const counted = row.state === 'counted'
      const link = row.campaignId ? `/dashboard/campaigns/${row.campaignId}` : row.requestId ? `/dashboard/requests/${row.requestId}` : '/dashboard'
      await notifyClientOwners(clientId, {
        kind: 'campaign_wrapped',
        title: counted ? 'Your count is in' : `${row.label}: we cannot count this one`,
        // The card's own line, word for word. A second phrasing here would be a second promise.
        body: counted
          ? `${row.label}. ${row.line}`
          : `${row.label}. ${row.line} We said this up front, and it has not changed.`,
        link,
        // Worth a phone buzzing: this is the day they were told to expect a number.
        email: true,
        emailCategory: 'content',
      }).catch(() => ({ notified: 0 }))

      // The stamp is already down (above). A notice nobody could send is not worth trying again
      // every morning for the rest of the year.
      told++
      outcomes.push({ clientId, promiseId: row.id, state: row.state, sent: true })
    }
  }

  return NextResponse.json({ ok: true, dryRun, told, skipped, stampFailed, outcomes: outcomes.slice(0, 50) })
}
