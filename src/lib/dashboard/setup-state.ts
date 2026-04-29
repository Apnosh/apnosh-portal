'use server'

/**
 * Client onboarding state -- "where are they on the setup checklist?"
 *
 * This is the data side of the SetupChecklist UI. Each step represents
 * one milestone from the onboarding runbook:
 *
 *   1. profile_complete    -- core business info filled in
 *   2. accounts_connected  -- linked at least one social/Google account
 *   3. content_started     -- edited copy, uploaded a photo, or any first action
 *
 * When all three are true, onboarding is "done" and the SetupChecklist
 * disappears. Until then it pins to the top of /dashboard.
 *
 * The checklist is a UI hint, not a gate. We never block clients from
 * the dashboard for being incomplete -- it just nudges them toward
 * the next thing.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

export interface SetupStep {
  key: 'profile' | 'accounts' | 'content'
  label: string
  hint: string
  ctaLabel: string
  ctaHref: string
  done: boolean
}

export interface SetupState {
  steps: SetupStep[]
  completed: number
  total: number
  isComplete: boolean
}

export async function getMySetupState(): Promise<
  { success: true; data: SetupState } | { success: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const db = adminDb()
  const { data: cu } = await db
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!cu?.client_id) return { success: false, error: 'No client account' }
  const clientId = cu.client_id as string

  // ─── Step 1: profile_complete ────────────────────────────────
  // Core fields filled: name (already true if record exists), industry,
  // primary contact info, at least one location.
  const { data: client } = await db
    .from('clients')
    .select('industry, email, phone, primary_contact')
    .eq('id', clientId)
    .maybeSingle()
  // Need at least one location entry too.
  const { count: locationsCount } = await db
    .from('client_locations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  const profileDone = !!(
    client?.industry &&
    client?.email &&
    client?.primary_contact &&
    (locationsCount ?? 0) > 0
  )

  // ─── Step 2: accounts_connected ──────────────────────────────
  // Either a platform_connections row (Meta/Instagram/TikTok/LinkedIn)
  // or a channel_connections row (Google Analytics/Search Console/GBP).
  const { count: platformCount } = await db
    .from('platform_connections')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', clientId)
  const { count: channelCount } = await db
    .from('channel_connections')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  const accountsDone = (platformCount ?? 0) + (channelCount ?? 0) > 0

  // ─── Step 3: content_started ─────────────────────────────────
  // Any of: edited a content field, uploaded a brand asset, created a
  // menu item or special, sent a message. The bar is "took ANY action."
  const [
    { count: contentEdits },
    { count: assetUploads },
    { count: menuItems },
    { count: specials },
    { count: messages },
  ] = await Promise.all([
    db.from('client_content_fields').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    db.from('brand_assets').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    db.from('menu_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    db.from('client_specials').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', clientId),
  ])
  const contentDone = (
    (contentEdits ?? 0) +
    (assetUploads ?? 0) +
    (menuItems ?? 0) +
    (specials ?? 0) +
    (messages ?? 0)
  ) > 0

  const steps: SetupStep[] = [
    {
      key: 'profile',
      label: 'Complete your business profile',
      hint: 'Industry, contact info, and your first location.',
      ctaLabel: 'Open profile',
      ctaHref: '/dashboard/profile',
      done: profileDone,
    },
    {
      key: 'accounts',
      label: 'Connect your accounts',
      hint: 'Instagram, Google Business Profile, and any other platforms.',
      ctaLabel: 'Connect',
      ctaHref: '/dashboard/connected-accounts',
      done: accountsDone,
    },
    {
      key: 'content',
      label: 'Take your first action',
      hint: 'Edit your site copy, upload a photo, or send us a message.',
      ctaLabel: 'Open my website',
      ctaHref: '/dashboard/website/manage',
      done: contentDone,
    },
  ]

  const completed = steps.filter(s => s.done).length
  return {
    success: true,
    data: {
      steps,
      completed,
      total: steps.length,
      isComplete: completed === steps.length,
    },
  }
}
