/**
 * /dashboard/business-info/connect-website — connect an owner's own
 * Vercel/GitHub website so business-info changes sync to it.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getWebsiteConnection } from '../website-actions'
import ConnectWebsite from './connect-website'

export const dynamic = 'force-dynamic'

export default async function ConnectWebsitePage() {
  const { user } = await resolveCurrentClient(null)
  if (!user) redirect('/login')

  const connection = await getWebsiteConnection()

  return <ConnectWebsite connection={connection} />
}
