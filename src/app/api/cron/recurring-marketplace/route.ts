/**
 * /api/cron/recurring-marketplace — the monthly heartbeat for creator monthly plans.
 *
 * A monthly plan (a recurring marketplace booking) is one payable work order PER MONTH. Subscribing
 * mints month 1; this cron mints each later month as its 30-day cycle comes due. Every month is its
 * own deliver → approve → bill, so nothing auto-charges without the restaurant approving that month's
 * work. Idempotent per month (the per-month order key), so a daily run never double-mints.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mintDueRecurringMonths } from '@/lib/marketplace/booking-work-order'
import { createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  const nowISO = new Date().toISOString()

  const { data: rows, error } = await admin
    .from('bookings')
    .select('id, slot_date, note')
    .eq('status', 'confirmed')
    .like('note', '%"shape":"recurring"%')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json({ ok: true, bookings: 0, minted: 0 })

  let minted = 0
  for (const b of rows as Array<Record<string, unknown>>) {
    const n = await mintDueRecurringMonths(b.id as string, (b.slot_date as string) ?? null, nowISO).catch(() => 0)
    if (n > 0) {
      minted += n
      // Best-effort: nudge the creator's linked login that a new month's work is waiting.
      try {
        const meta = JSON.parse((b.note as string) || '{}') as { vendorId?: string; listingTitle?: string }
        if (meta.vendorId) {
          const { data: v } = await admin.from('vendors').select('person_id').eq('id', meta.vendorId).maybeSingle()
          if (v?.person_id) {
            await createNotification({ userId: v.person_id as string, kind: 'client_request', title: 'A new month of work', body: `${meta.listingTitle || 'A monthly plan'}: this month's work is in your queue.`, link: '/creator/work' }).catch(() => {})
          }
        }
      } catch { /* notify never blocks minting */ }
    }
  }

  return NextResponse.json({ ok: true, bookings: rows.length, minted })
}
