import 'server-only'

/**
 * calendarForCreator — the creator's master-calendar items for a given creator id. Shared by the
 * Bookings page (getMyCalendar → session creator) and the Work inbox API (already-resolved creator),
 * so both screens show the same calendar. Reads their active work orders (every confirmed booking +
 * campaign piece mints one) and joins shoot times from the linked booking.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { CalendarItem } from './creator-schedule-types'

const BOOKING_KEY = /^booking:([0-9a-f-]{36})/i

export async function calendarForCreator(creatorId: string): Promise<CalendarItem[]> {
  if (!creatorId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('creator_work_orders')
    .select('id, title, status, due_date, campaign_piece_key')
    .eq('creator_id', creatorId)
    .not('due_date', 'is', null)
    .not('status', 'in', '(approved,declined)')
    .order('due_date', { ascending: true })
  const orders = (data ?? []) as Array<Record<string, unknown>>

  const bookingIds = [...new Set(orders.map((o) => BOOKING_KEY.exec((o.campaign_piece_key as string | null) ?? '')?.[1]).filter(Boolean) as string[])]
  const timeById = new Map<string, string | null>()
  if (bookingIds.length) {
    const { data: bks } = await admin.from('bookings').select('id, slot_start').in('id', bookingIds)
    for (const b of bks ?? []) timeById.set(b.id as string, (b.slot_start as string | null) ?? null)
  }

  return orders.map((o) => {
    const bId = BOOKING_KEY.exec((o.campaign_piece_key as string | null) ?? '')?.[1]
    const time = bId ? (timeById.get(bId) ?? null) : null
    return {
      id: o.id as string,
      date: o.due_date as string,
      time,
      title: (o.title as string) || 'Work',
      status: (o.status as string) || '',
      kind: time ? ('shoot' as const) : ('work' as const),
      bookingId: bId ?? null,
    }
  })
}
