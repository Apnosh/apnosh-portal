/**
 * Vercel Cron: nightly proof composer.
 *
 * For every client, evaluates the three card types (Google week, post,
 * reviews) against real ledgers and fires new proof_cards rows — capped at
 * 2 per client per rolling week. When a card fires, drops ONE in-app
 * notification per client per week (the plain sentence itself), through the
 * same rail the monthly recap uses. If the proof_cards table is not yet
 * migrated, exits cleanly and reports so.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeForClient } from '@/lib/proof/compose'
import { getClientOwnerUserIds } from '@/lib/dashboard/client-owners'
import { createNotification } from '@/lib/notify'

export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // Migration guard: a clean "not yet" instead of a crash.
  const probe = await admin.from('proof_cards').select('id', { head: true, count: 'exact' }).limit(1)
  if (probe.error) {
    return NextResponse.json({ ok: false, reason: 'proof_cards table missing (run migration 249)' })
  }

  const { data: clients } = await admin.from('clients').select('id, name')
  let firedTotal = 0
  const details: Record<string, string[]> = {}
  for (const c of clients ?? []) {
    try {
      const fired = await composeForClient(admin, c.id as string, now)
      if (fired.length) {
        details[(c.name as string) || (c.id as string)] = fired
        firedTotal += fired.length

        // One notification per client per week, max — the card is the message.
        const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)
        const { data: card } = await admin
          .from('proof_cards')
          .select('big, label')
          .eq('client_id', c.id as string)
          .eq('card_key', fired[0])
          .maybeSingle()
        if (card) {
          const owners = await getClientOwnerUserIds(admin, c.id as string)
          for (const userId of owners) {
            const { count } = await admin
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('type', 'proof')
              .gte('created_at', weekAgo.toISOString())
            if ((count ?? 0) === 0) {
              await createNotification({
                supabase: admin, userId, type: 'proof',
                title: card.big as string,
                body: card.label as string,
                link: '/dashboard',
              })
            }
          }
        }
      }
    } catch (e) {
      console.error('[compose-proof] client failed:', c.id, e)
    }
  }

  return NextResponse.json({ ok: true, clients: clients?.length ?? 0, fired: firedTotal, details })
}
