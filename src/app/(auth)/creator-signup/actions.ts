'use server'

/**
 * becomeCreator — the self-serve half of creator signup. The person creates their OWN login on the
 * client (supabase.auth.signUp, their own password), then this turns that login into a creator:
 * creates their vendor and wires both resolution links. No admin, no invite email — they signed
 * themselves up. Guards against converting a restaurant account (that would break its routing).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { onboardCreatorCore, type CreatorCraft } from '@/lib/marketplace/onboard-creator'

export async function becomeCreator(input: { name: string; craft: CreatorCraft; serviceArea?: string[] }): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please create your account first.' }

  const admin = createAdminClient()
  // A restaurant account must not become a creator on the same login — the middleware routes clients
  // to /dashboard first, so they'd never reach their creator workspace. Ask them to use a fresh email.
  const { data: cu } = await admin.from('client_users').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (cu) return { ok: false, error: 'This email is already a restaurant account. Sign up as a creator with a different email.' }

  const res = await onboardCreatorCore({
    name: input.name,
    email: user.email ?? '',
    craft: input.craft,
    serviceArea: input.serviceArea,
    personId: user.id,   // they just signed up — link THIS login, no email
    invite: false,
    bookable: false,      // review gate: they build their profile now, admin approves them into the store
  })
  return { ok: res.ok, error: res.error, slug: res.slug }
}
