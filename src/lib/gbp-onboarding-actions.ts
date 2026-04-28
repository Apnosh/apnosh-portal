'use server'

/**
 * Server actions for the per-client GBP onboarding workflow.
 * Used by the client list status badge, the per-client banner, and
 * the "Send Manager invite" admin action.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
  getAllClientGbpStatuses,
  getClientGbpStatus,
  type ClientGbpStatus,
} from '@/lib/gbp-status'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function adminDb() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'admin' || profile?.role === 'super_admin'
}

export async function getClientGbpStatusAction(clientId: string): Promise<
  | { success: true; data: ClientGbpStatus | null }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }
  const data = await getClientGbpStatus(clientId)
  return { success: true, data }
}

export async function getAllClientGbpStatusesAction(): Promise<
  | { success: true; data: Record<string, ClientGbpStatus> }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }
  const map = await getAllClientGbpStatuses()
  return { success: true, data: Object.fromEntries(map) }
}

/**
 * Mark the GBP onboarding email as sent. Doesn't actually send the
 * email -- the admin sends via their own mail client (mailto: link)
 * because they want to personalize each one. We just record that
 * they clicked the button so the UI can hide the prompt and start
 * the reminder timer.
 */
export async function markGbpInviteSent(clientId: string): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }
  const db = adminDb()
  const { error } = await db
    .from('clients')
    .update({ gbp_invite_sent_at: new Date().toISOString() })
    .eq('id', clientId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/clients')
  revalidatePath(`/admin/clients/${clientId}`)
  return { success: true }
}

/**
 * Build a personalized onboarding email body for a given client.
 * Returned as plain text so the admin can paste into Gmail and
 * tweak before sending.
 */
export interface OnboardingEmailDraft {
  to: string
  subject: string
  body: string
}

export async function buildGbpOnboardingEmail(clientId: string): Promise<
  | { success: true; data: OnboardingEmailDraft }
  | { success: false; error: string }
> {
  if (!(await requireAdmin())) return { success: false, error: 'Admin only' }
  const db = adminDb()
  const { data: client } = await db
    .from('clients')
    .select('id, name, primary_contact, email')
    .eq('id', clientId)
    .maybeSingle()
  const c = client as {
    id: string; name: string; primary_contact: string | null; email: string | null
  } | null
  if (!c) return { success: false, error: 'Client not found' }

  const greeting = c.primary_contact ? `Hi ${c.primary_contact.split(' ')[0]},` : 'Hi there,'

  const body = `${greeting}

To pull your Google Business Profile performance into the Apnosh portal automatically, we need you to add us as a Manager on your listing. It takes about 60 seconds:

  1. Go to https://business.google.com/locations
  2. Click into "${c.name}"
  3. Click the three-dot menu (top right) → Business Profile settings → Managers
  4. Click "Add" and enter:  apnosh@gmail.com
  5. Set the role to "Manager" (not Owner) and click Invite

Once you accept on our end, your dashboard at portal.apnosh.com will start showing your daily impressions, calls, direction requests, and search queries within 24 hours.

If you'd rather have me walk you through it on a quick call, just reply and we'll grab 5 minutes.

Thanks!`

  return {
    success: true,
    data: {
      to: c.email ?? '',
      subject: `Quick step to connect your Google Business Profile to Apnosh`,
      body,
    },
  }
}
