/**
 * /creator/account/profile — edit your creator profile (name, bio, skills, area, style).
 */
import { redirect } from 'next/navigation'
import { getMyCreatorProfile } from '@/lib/marketplace/creator-store-actions'
import ProfileEditor from '@/components/creator/profile-editor'

export const dynamic = 'force-dynamic'

export default async function CreatorProfileEditPage() {
  const profile = await getMyCreatorProfile()
  if (!profile) redirect('/creator/work')
  return <ProfileEditor initial={profile} />
}
