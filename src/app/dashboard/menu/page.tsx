/**
 * /dashboard/menu — Mobile navigation hub (server wrapper).
 *
 * Resolves the signed-in user's account info (restaurant name, plan,
 * initials) and hands off to <MenuView />, which renders the
 * searchable, iOS-Settings-style grouped directory on the client.
 *
 * The directory itself (sections + items + colors) lives in
 * menu-view.tsx so search can run client-side without a round trip.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTier } from '@/lib/agent/tiers'
import MenuView from './menu-view'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  let restaurantName = 'Apnosh'
  let userName = user.email ?? 'Account'
  let userEmail = user.email ?? ''
  let userInitials = 'AP'
  let planLabel: string | null = null

  if (clientId) {
    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('name, tier')
      .eq('id', clientId)
      .maybeSingle() as { data: { name: string; tier: string | null } | null }
    if (client?.name) restaurantName = client.name
    if (client?.tier) planLabel = resolveTier(client.tier).label

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle() as { data: { full_name: string | null; email: string | null } | null }
    if (profile?.full_name) {
      userName = profile.full_name
      userInitials = profile.full_name.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2)
    } else {
      userInitials = (user.email ?? 'AP').slice(0, 2).toUpperCase()
    }
    if (profile?.email) userEmail = profile.email
  }

  return (
    <MenuView
      restaurantName={restaurantName}
      userName={userName}
      userEmail={userEmail}
      userInitials={userInitials}
      planLabel={planLabel}
    />
  )
}
