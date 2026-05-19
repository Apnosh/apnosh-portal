'use server'

/**
 * Server action wrapper for /dashboard/customer-view. Resolves the
 * caller's client_id (with the same admin-override convention as the
 * audit page), kicks off a customer-eye-view run, and revalidates the
 * page so the new report renders.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCustomerEyeView } from '@/lib/customer-eye-view'

export async function triggerCustomerEyeView(
  clientSlug?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  /* Same pattern as the audit page: optional admin override via slug,
     otherwise resolve via client_users. */
  let clientId: string | null = null

  if (clientSlug) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle() as { data: { role: string } | null }
    if (profile?.role === 'admin' || profile?.role === 'super_admin') {
      const { data: c } = await admin
        .from('clients')
        .select('id')
        .eq('slug', clientSlug)
        .maybeSingle() as { data: { id: string } | null }
      if (c) clientId = c.id
    }
  }

  if (!clientId) {
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle() as { data: { client_id: string } | null }
    clientId = cu?.client_id ?? null
  }

  if (!clientId) return { ok: false, error: 'No client found for this user' }

  try {
    await runCustomerEyeView(clientId)
    revalidatePath('/dashboard/customer-view')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
