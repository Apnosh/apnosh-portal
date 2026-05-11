/**
 * /work — auto-routes to the user's primary work surface.
 *
 * If they have multiple capabilities, the workspace switcher controls
 * which lens they're "viewing as". This page just sends them to that
 * lens's landing path.
 */

import { redirect } from 'next/navigation'
import { getActiveRole } from '@/lib/auth/capabilities'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function WorkIndex({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const active = await getActiveRole(sp.role ?? null)
  if (!active) redirect('/dashboard')
  redirect(active.landingPath)
}
