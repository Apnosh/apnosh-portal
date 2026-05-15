import { redirect } from 'next/navigation'
import { getWebsiteSetupState } from '@/lib/dashboard/website-setup'
import SetupWizard from './setup-wizard'

/**
 * Server component: load the wizard's resume state, then hand off
 * to the client wizard. Each tool we wire up writes its progress
 * to the DB, so a page refresh lands you back on the right step.
 */
export default async function WebsiteSetupPage() {
  const state = await getWebsiteSetupState()
  if (!state) redirect('/login')
  return <SetupWizard initialState={state} />
}
