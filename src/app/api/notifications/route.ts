/**
 * GET /api/notifications
 *
 * Returns the current user's recent notifications + unread count.
 * Used by the work-layout bell to keep the badge fresh without a
 * full page reload.
 */

import { NextResponse } from 'next/server'
import { listForCurrentUser, unreadCountForCurrentUser } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [items, unreadCount] = await Promise.all([
    listForCurrentUser(12),
    unreadCountForCurrentUser(),
  ])
  return NextResponse.json({ items, unreadCount })
}
