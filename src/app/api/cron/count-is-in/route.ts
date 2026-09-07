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
 * AND THE COUNT BECOMES A CARD. A promise that lands 'counted' with a real number that went the
 * right way (the ledger's own tone: up, or flat with nothing before it) also composes
 * one proof card (card_type 'promise_counted', migration 262) — the ONE kind of card the product
 * calls a win, the only kind the wins shelf lists and the only kind that can be given a public
 * link. That is what makes "Counted by Apnosh" on the foot of a shared card true: every win is an
 * order somebody bought, counted on the day they were told. Idempotent on card_key
 * 'promise:<promise id>', best-effort before 262 (the card is skipped, the notice still goes).
 *
 * Auth: THE CRON_SECRET, ALWAYS. A query param or a bearer token, and nothing else — the
 * vercel-cron user-agent is a header anyone can send, and this route emails owners, so it is not a
 * door. Vercel sends the secret itself (Authorization: Bearer $CRON_SECRET) on scheduled runs when
 * CRON_SECRET is set in the project, so the real cron still gets in. With no CRON_SECRET set the
 * route refuses to run at all. `dryRun=1` computes who WOULD be told and writes nothing.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPromiseRows } from '@/lib/promises/read'
import { notifyClientOwners } from '@/lib/notifications'
import { countedCardWords } from '@/lib/promises/lines'
import { renderCardWords, WIN_TYPE } from '@/lib/love/win'
import type { PromiseRow } from '@/lib/promises/read'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

/** The states worth telling somebody about on the day their number was promised. */
const TELLABLE = new Set(['counted', 'not_counted'])

/** The ledger row behind a promise, as the cron reads it back with select('*'). */
type StoredPromise = Record<string, unknown>

/**
 * The card this kept promise makes, written once.
 *
 * Only a 'counted' row whose number is positive AND went the right way gets one; a not_counted
 * promise is an honest notice and never a card, because there is nothing on it to show anybody
 * (src/lib/promises/lines.ts countedCardWords decides, and is proved in scripts/verify-wins.ts).
 *
 * Both forms are stored: the English sentences in label/big/context, so anything reading the row
 * raw still reads words, and the key plus its numbers in metadata.words, so the owner's page and
 * the public page can draw it in the owner's own language later.
 *
 * Best-effort. Before migration 262 the card_type is refused by the check constraint and metadata
 * is not a column; the run warns which SQL is missing and the owner still gets told their count.
 */
async function composeCountedCard(
  admin: SupabaseClient,
  clientId: string,
  row: PromiseRow,
  stored: StoredPromise | undefined,
): Promise<'fired' | 'nothing-to-show' | 'blocked'> {
  const words = countedCardWords({
    state: row.state,
    // The ledger's own reading of which way this number moved. A promise that went DOWN makes no
    // card at all, so a rating that fell can never become something the owner is told to show.
    tone: row.tone,
    label: row.label,
    metricKey: String(stored?.metric_key ?? ''),
    metricLabel: String(stored?.metric_label ?? ''),
    value: row.value,
    countFrom: String(stored?.count_from ?? ''),
    showsOn: row.showsOn,
  })
  if (!words) return 'nothing-to-show'

  // The same words the reader will draw, drawn once in English for the row's own columns.
  const en = renderCardWords({ words }, { label: row.label, big: row.value, context: '' }, 'en')
  const { error } = await admin.from('proof_cards').upsert({
    client_id: clientId,
    card_key: `promise:${row.id}`,
    card_type: WIN_TYPE,
    label: en.label,
    big: en.big,
    context: en.context,
    is_sample: false,
    metadata: {
      words: { label: words.label, big: words.big, context: words.context },
      promiseId: row.id,
      // What was counted, so a reader can tell a rating (a pair, "4.5 → 4.7") from a plain count
      // and read the right half of it. src/lib/love/win.ts winNumber is the reader.
      metricKey: String(stored?.metric_key ?? ''),
      campaignId: row.campaignId,
      requestId: row.requestId,
    },
  }, { onConflict: 'client_id,card_key', ignoreDuplicates: true })
  if (error) {
    console.warn('[count-is-in] could not compose the win card (apply migration 262):', error.message)
    return 'blocked'
  }
  return 'fired'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  // THE SECRET, ALWAYS. The other crons also open on the vercel-cron user-agent, which is a plain
  // header anyone can send. On this one that is a mailshot: it emails every owner whose count is
  // in, in their own name. So the user-agent is not accepted here at all, and with CRON_SECRET
  // unset the route refuses to run rather than falling open.
  if (!CRON_SECRET) {
    console.error('[count-is-in] CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
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
  // The stored row too: the card names what was counted (metric_label) and the window it was
  // counted over, and neither of those is on the computed row.
  const storedById = new Map<string, Record<string, unknown>>()
  for (const r of due) {
    storedById.set(String(r.id), r)
    const cid = String(r.client_id ?? '')
    if (!cid) continue
    const set = byClient.get(cid) ?? new Set<string>()
    set.add(String(r.id))
    byClient.set(cid, set)
  }

  let told = 0, skipped = 0, stampFailed = 0, wins = 0, winsBlocked = 0
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

      // The count is in and it is a real number: that is a win, and a win is a card the owner can
      // show somebody. Never for not_counted, which has no number on it at all.
      if (counted) {
        const made = await composeCountedCard(admin, clientId, row, storedById.get(row.id))
        if (made === 'fired') wins++
        else if (made === 'blocked') winsBlocked++
      }

      // The stamp is already down (above). A notice nobody could send is not worth trying again
      // every morning for the rest of the year.
      told++
      outcomes.push({ clientId, promiseId: row.id, state: row.state, sent: true })
    }
  }

  return NextResponse.json({ ok: true, dryRun, told, skipped, stampFailed, wins, winsBlocked, outcomes: outcomes.slice(0, 50) })
}
