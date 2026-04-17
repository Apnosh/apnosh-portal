import { redirect } from 'next/navigation'

// Legacy route -- moved to /dashboard/connected-accounts
// Preserves bookmarks and the onboarding `returnTo=/dashboard/connect-accounts` path.
export default function LegacyConnectAccountsPage() {
  redirect('/dashboard/connected-accounts')
}
