/**
 * /dashboard/calendar — redirect to the unified Plan calendar.
 *
 * The calendar merged into /dashboard/analytics (Plan), which shows the
 * owner's editable plans alongside Apnosh's scheduled content in one
 * view. This stub preserves old links/bookmarks (and the admin
 * ?clientId= param) by forwarding to the new home.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const { clientId } = await searchParams
  redirect(clientId ? `/dashboard/analytics?clientId=${encodeURIComponent(clientId)}` : '/dashboard/analytics')
}
