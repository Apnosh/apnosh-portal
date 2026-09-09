/**
 * Vercel Cron: THE WEEKLY NOTE.
 * ==============================
 * Sixteen of twenty owners in testing asked for something that arrives rather
 * than something they log into, and the product's only recurring outbound was a
 * monthly in-app nudge saying a recap was ready somewhere else.
 *
 * This sends the finding itself, once a week. Composed by src/lib/weekly-note.ts;
 * this file only decides who gets it and what carries it.
 *
 * TWO RULES IT WILL NOT BREAK.
 *
 * 1. A QUIET WEEK IS NOT SENT. The composer says plainly when nothing moved, and
 *    a weekly message that arrives with nothing in it teaches the owner to
 *    ignore the next one, which is the only asset this whole idea has.
 * 2. ONCE PER CLIENT PER WEEK. The send is recorded before it goes out and
 *    checked before it is composed, so a retry, a manual run and the scheduled
 *    run cannot stack up in somebody's inbox.
 *
 * Delivery today is email plus an in-app notification. SMS is the same text and
 * slots in beside sendEmailIfConfigured once carrier registration clears; that
 * is the channel most of these owners actually asked for, and the one that
 * reaches the ones who will never open the app.
 *
 * Auth: THE CRON_SECRET, ALWAYS — a query param or a bearer token, nothing else.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildWeeklyNote, noteToText } from '@/lib/weekly-note'
import { ownerEmailsForClient, sendEmailIfConfigured } from '@/lib/email/send'
import { getClientOwnerUserIds } from '@/lib/dashboard/client-owners'
import { createNotification } from '@/lib/notify'
import { getClientLanguage } from '@/lib/i18n/language'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

/** ISO week stamp, e.g. 2026-W37 — the idempotency key for one client's send. */
function weekStamp(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!CRON_SECRET) {
    console.error('[weekly-note] CRON_SECRET is not set; refusing to run')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  /* dryRun composes and returns the notes without sending or recording, so the
     wording can be read before anybody's phone buzzes. */
  const dryRun = url.searchParams.get('dryRun') === '1'
  const onlyClientId = url.searchParams.get('clientId')

  const admin = createAdminClient()
  const stamp = weekStamp(new Date())

  let q = admin.from('clients').select('id, name, status').eq('status', 'active')
  if (onlyClientId) q = q.eq('id', onlyClientId)
  const { data: clients, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out: Array<{ client: string; sent: boolean; reason?: string; headline?: string }> = []

  for (const c of (clients ?? []) as Array<{ id: string; name: string | null }>) {
    const name = (c.name ?? 'Your restaurant').trim()
    try {
      if (!dryRun) {
        /* Claim the week BEFORE composing. The unique index is the guarantee;
           a duplicate insert simply means somebody else already sent it. */
        const { error: claimErr } = await admin
          .from('weekly_note_sends')
          .insert({ client_id: c.id, week: stamp })
        if (claimErr) { out.push({ client: name, sent: false, reason: 'already sent this week' }); continue }
      }

      const lang = await getClientLanguage(c.id).catch(() => 'en' as const)
      const note = await buildWeeklyNote(c.id, lang)
      if (note.quiet) {
        out.push({ client: name, sent: false, reason: 'quiet week' })
        continue
      }
      const text = noteToText(note, name, lang)
      out.push({ client: name, sent: !dryRun, headline: note.headline })
      if (dryRun) continue

      const emails = await ownerEmailsForClient(c.id).catch(() => [] as string[])
      if (emails.length) {
        await sendEmailIfConfigured({ to: emails, subject: note.headline, text }).catch(() => ({ sent: false }))
      }
      const userIds = await getClientOwnerUserIds(admin, c.id).catch(() => [] as string[])
      for (const userId of userIds) {
        await createNotification({
          /* 'report_ready' is an existing allowed type and the notifications
             table constrains the column, so a new one would need a migration for
             no gain: the TITLE carries the finding, which is the whole point, and
             the type is only used for grouping and the icon. */
          supabase: admin, userId, type: 'report_ready',
          title: note.headline,
          body: note.lines.join(' '),
          link: '/dashboard/insights',
        })
      }
    } catch (e) {
      out.push({ client: name, sent: false, reason: e instanceof Error ? e.message : 'failed' })
    }
  }

  return NextResponse.json({ week: stamp, dryRun, results: out })
}
