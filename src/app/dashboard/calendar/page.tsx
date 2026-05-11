/**
 * /dashboard/calendar — the unified calendar.
 *
 * One timeline of everything upcoming for the owner. Replaces the
 * old social-only content_calendar view (still available at
 * /dashboard/social/calendar for drill-down).
 *
 * Server work here:
 *   - resolve clientId via businesses + client_users
 *   - fetch unified calendar events
 *   - fetch client.created_at (drives onboarding playbook overlay)
 *   - sign clientId for the .ics subscribe URL
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCalendar } from '@/lib/dashboard/get-calendar'
import { signClientId } from '@/lib/calendar/feed-token'
import CalendarView from './calendar-view'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let clientId: string | null = null
  const { data: business } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  clientId = (business?.client_id as string | null) ?? null
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = (cu?.client_id as string | null) ?? null
  }
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your calendar.
      </div>
    )
  }

  const [events, clientRow] = await Promise.all([
    getCalendar(clientId),
    supabase.from('clients').select('created_at').eq('id', clientId).maybeSingle(),
  ])

  const clientCreatedAt = (clientRow.data?.created_at as string | null) ?? null
  const token = signClientId(clientId)
  const subscribeUrl = `/api/calendar/feed?c=${encodeURIComponent(clientId)}&t=${token}`

  return (
    <CalendarView
      events={events}
      clientCreatedAt={clientCreatedAt}
      subscribePath={subscribeUrl}
    />
  )
}
