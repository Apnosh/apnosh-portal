/**
 * Vercel Cron: monthly nudge to bill accrued campaign work (1st of the month).
 *
 * Deliberately does NOT auto-create Stripe invoices: generating a real invoice
 * is an admin judgment call (bundle or split, hold for a dispute, write off),
 * so the cron only tells every admin which clients have money waiting and
 * where the one-click generate button lives (the client's billing card).
 * One notification per admin summarizing all clients — not one per client —
 * so the 1st of the month is a single inbox item, not a pile.
 *
 * Secret gate identical to the other cron routes.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  // Stricter than the fleet's shared gate: when CRON_SECRET is configured the
  // secret is REQUIRED (Vercel's cron sends it as a Bearer header automatically),
  // because the user-agent is spoofable and this response carries a receivables
  // total. The UA fallback only remains for environments with no secret set.
  const authorized = CRON_SECRET
    ? querySecret === CRON_SECRET || headerSecret === CRON_SECRET
    : !!isVercelCron
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Everything accrued, grouped by client. Pre-197 this table exists (180), so
  // the read never needs a column guard; a read failure just means no reminder.
  const { data: charges, error } = await admin
    .from('campaign_charges')
    .select('client_id, amount_cents')
    .eq('status', 'accrued')
    .gt('amount_cents', 0)
    .limit(2000)
  if (error) return NextResponse.json({ ok: false, error: error.message })

  const byClient = new Map<string, number>()
  for (const c of charges ?? []) {
    const id = c.client_id as string
    byClient.set(id, (byClient.get(id) ?? 0) + ((c.amount_cents as number) ?? 0))
  }
  if (byClient.size === 0) return NextResponse.json({ ok: true, clients: 0, notified: 0 })

  const clientIds = [...byClient.keys()]
  const { data: clients } = await admin.from('clients').select('id, name').in('id', clientIds)
  const nameOf = new Map((clients ?? []).map((c) => [c.id as string, (c.name as string) || 'Unnamed client']))

  const totalCents = [...byClient.values()].reduce((s, v) => s + v, 0)
  const top = [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, cents]) => `${nameOf.get(id) ?? id.slice(0, 8)} ($${Math.round(cents / 100)})`)
  const more = byClient.size > top.length ? ` and ${byClient.size - top.length} more` : ''

  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((p) => p.id as string)

  let notified = 0
  for (const userId of adminIds) {
    await createNotification({
      userId,
      kind: 'invoice_reminder',
      title: `$${Math.round(totalCents / 100)} of campaign work is waiting to be invoiced`,
      body: `${byClient.size} client${byClient.size === 1 ? ' has' : 's have'} delivered work not on any invoice: ${top.join(', ')}${more}. Generate each invoice from the client's billing card.`,
      link: '/admin/clients',
    })
    notified++
  }

  return NextResponse.json({ ok: true, clients: byClient.size, totalCents, notified })
}
