/**
 * /work/clients/[clientId]/settings
 *
 * Operator-facing settings page for a specific client. v1 surfaces
 * the approval flow toggles; future iterations can add brand voice
 * version controls, AI temperature, posting cadence, etc.
 *
 * Reads RLS-scoped — staff who can't see this client get a 404.
 */

import { redirect, notFound } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getApprovalSettings, DEFAULT_APPROVAL_SETTINGS } from '@/lib/work/approval-settings'
import SettingsView from './settings-view'

export const dynamic = 'force-dynamic'

interface PageProps { params: Promise<{ clientId: string }> }

export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    redirect('/work')
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) notFound()

  const settings = await getApprovalSettings(clientId)

  return (
    <SettingsView
      clientId={clientId}
      clientName={(client.name as string) ?? 'Client'}
      initialSettings={settings}
      defaults={DEFAULT_APPROVAL_SETTINGS}
    />
  )
}
