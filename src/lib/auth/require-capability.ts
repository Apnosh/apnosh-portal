/**
 * Server gate for /work/* and /marketplace pages.
 *
 * Each role surface calls requireCapability('strategist') (or whichever)
 * at the top of its server component. If the user is signed out, we
 * redirect to /login. If they're signed in but don't have the
 * capability, we redirect to a safe landing (their first active role,
 * else /dashboard).
 *
 * Admins are implicit super-users: requireCapability('anything')
 * succeeds for admin.
 */

import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getMyCapabilities, type RoleCapability } from '@/lib/auth/capabilities'

export async function requireCapability(cap: RoleCapability): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const caps = await getMyCapabilities()
  if (caps.some(c => c.role === cap || c.role === 'admin')) return

  // Drop them on the most relevant lens they actually have.
  const landing = caps[0]?.landingPath ?? '/dashboard'
  redirect(landing)
}
