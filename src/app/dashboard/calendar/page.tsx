/**
 * /dashboard/calendar — the unified calendar.
 *
 * One timeline of everything upcoming for the owner: scheduled posts,
 * email sends, filming days, planned content, owner tasks. Replaces
 * the old social-only content_calendar view (that single-source view
 * still exists at /dashboard/social/calendar for users who need to
 * drill into just social).
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCalendar } from '@/lib/dashboard/get-calendar'
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

  const events = await getCalendar(clientId)
  return <CalendarView events={events} />
}
