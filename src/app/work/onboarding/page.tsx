/**
 * /work/onboarding — new client intake.
 *
 * Onboarder fills in 5 minutes of discovery info, AI proposes the
 * full starter foundation (voice, facts, opening theme), onboarder
 * reviews, commits. Output: a new client with brand + 6-10 facts +
 * month-1 theme ready for the rest of the team.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import OnboardingView from './onboarding-view'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  await requireAnyCapability(['onboarder'])
  return <OnboardingView />
}
