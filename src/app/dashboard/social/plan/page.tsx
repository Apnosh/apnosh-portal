/**
 * /dashboard/social/plan — the editorial plan.
 *
 * Shows the client what's planned this month: theme, content pillars,
 * key dates to plan around, and the slate of content lined up against
 * them. Plus a forward look at next month.
 *
 * Strategist sets these on /admin/clients/[slug]/themes; client sees
 * only the 'shared' status (planning state is hidden so strategists
 * can iterate privately).
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEditorialPlan } from '@/lib/dashboard/get-editorial-plan'
import EditorialPlanView from './plan-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function EditorialPlanPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = sp.clientId ?? null
  } else {
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
  }

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your editorial plan.
      </div>
    )
  }

  const data = await getEditorialPlan(clientId)
  return <EditorialPlanView data={data} />
}
