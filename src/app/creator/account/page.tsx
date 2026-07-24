/**
 * /creator/account — the creator's account hub. Reached from the avatar in the creator shell header.
 */
import { redirect } from 'next/navigation'
import { getMyCreatorProfile } from '@/lib/marketplace/creator-store-actions'
import AccountHub from '@/components/creator/account-hub'

export const dynamic = 'force-dynamic'

export default async function CreatorAccountPage() {
  const profile = await getMyCreatorProfile()
  if (!profile) redirect('/creator/work')
  return <AccountHub profile={profile} />
}
