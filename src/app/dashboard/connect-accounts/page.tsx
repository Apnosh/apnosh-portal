import { redirect } from 'next/navigation'

/**
 * Legacy route. The "Connected Accounts" surface lives at
 * /dashboard/connected-accounts now. Several Google OAuth callback handlers
 * still redirect here mid-flow; this page just bounces them along.
 *
 * Once we update every OAuth callback to use the new path directly we can
 * remove this stub.
 */
export default function LegacyConnectAccountsRedirect() {
  redirect('/dashboard/connected-accounts')
}
