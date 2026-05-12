/**
 * POST /api/notifications/mark-read
 *
 * Marks every unread row for the current user as read. Called when
 * the bell dropdown opens — simpler than per-row marking and matches
 * what users expect ("opened my inbox → cleared").
 */

import { NextResponse } from 'next/server'
import { markAllReadForCurrentUser } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST() {
  const result = await markAllReadForCurrentUser()
  return NextResponse.json(result)
}
