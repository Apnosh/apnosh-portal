/**
 * /api/cron/booking-reminders — the day-before nudge for creator bookings.
 *
 * Once a day, find every CONFIRMED creator booking happening tomorrow and remind both sides: the
 * restaurant (so they're ready to host) and the creator (so they show up), each with the time and a
 * link to their bookings. Creator bookings are the ones whose note carries our marketplace marker;
 * campaign shoots ride a different path and are untouched.
 *
 * Idempotent per UTC day: we skip a recipient who already got today's booking reminder (the
 * awaiting-you-digest pattern), so a manual re-run never double-pings.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClientOwners, createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

interface Meta { kind?: string; vendorId?: string; listingTitle?: string }
function parseMeta(note: string | null): Meta | null {
  if (!note) return null
  try { const m = JSON.parse(note) as Meta; return m?.kind === 'creator' ? m : null } catch { return null }
}
function fmtT(hhmm: string | null): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function dayLabel(date: string, start: string | null): string {
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return start ? `${d} at ${fmtT(start)}` : d
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Tomorrow's UTC calendar day (the wall-clock slot lives in the booking's own timezone; a day-ahead
  // nudge is coarse enough that the UTC day is the right granularity).
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: rows, error } = await admin
    .from('bookings')
    .select('id, client_id, rule_id, slot_date, slot_start, timezone, note')
    .eq('status', 'confirmed')
    .eq('slot_date', tomorrow)
    .like('note', '%"kind":"creator"%')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json({ ok: true, date: tomorrow, bookings: 0, notified: 0 })

  // Who already got today's booking reminder (dedupe across manual re-runs).
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const { data: sentToday } = await admin
    .from('notifications').select('user_id').eq('type', 'booking_reminder').gte('created_at', todayStart.toISOString())
  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id as string))

  let notified = 0
  for (const b of rows as Array<Record<string, unknown>>) {
    const meta = parseMeta(b.note as string | null)
    if (!meta) continue
    const label = dayLabel(b.slot_date as string, (b.slot_start as string) ?? null)
    const title = meta.listingTitle ? `${meta.listingTitle} is tomorrow` : 'A booking is tomorrow'

    // Restaurant side — skip if every owner already got today's reminder.
    const clientId = b.client_id as string
    const [{ data: cu }, { data: biz }] = await Promise.all([
      admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
      admin.from('businesses').select('owner_id').eq('client_id', clientId),
    ])
    const ownerIds = new Set<string>([...(cu ?? []).map((r) => r.auth_user_id as string), ...(biz ?? []).map((r) => r.owner_id as string).filter(Boolean)])
    if (ownerIds.size && ![...ownerIds].every((u) => alreadySent.has(u))) {
      await notifyClientOwners(clientId, { kind: 'booking_reminder', title, body: `${label}. A quick prep and you're set.`, link: '/dashboard/bookings' }).catch(() => ({ notified: 0 }))
      notified++
    }

    // Creator side — only if a real login is linked (example creators have none).
    if (meta.vendorId) {
      const { data: v } = await admin.from('vendors').select('person_id').eq('id', meta.vendorId).maybeSingle()
      const pid = v?.person_id as string | null
      if (pid && !alreadySent.has(pid)) {
        await createNotification({ userId: pid, kind: 'booking_reminder', title, body: `${label}. See you there.`, link: '/creator/bookings' }).catch(() => {})
        notified++
      }
    }
  }

  return NextResponse.json({ ok: true, date: tomorrow, bookings: rows.length, notified })
}
