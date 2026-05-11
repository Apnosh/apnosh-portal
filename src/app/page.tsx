/**
 * Root route — bounce to the right home based on role.
 *
 *   - No session            -> /login
 *   - profiles.role=admin   -> /admin (Apnosh staff console)
 *   - everyone else         -> /dashboard (client portal)
 *
 * The auth/callback route does this same check after OAuth, but
 * users who hit / directly (typed URL, bookmark, signed-in cookie
 * from another tab) bypass that path. Without this redirect, Apnosh
 * staff land on the client portal and have to manually navigate to
 * /admin.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if ((profile?.role as string | null) === 'admin') {
    redirect('/admin')
  }
  redirect('/dashboard')
}
