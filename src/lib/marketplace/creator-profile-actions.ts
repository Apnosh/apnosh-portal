'use server'

/**
 * Server action wrapper so the in-store profile page can load a creator's full profile. Thin: all
 * the work is in the server-only reader; this only exposes it as a callable action. Only exports an
 * async function (the 'use server' rule).
 */

import { getCreatorProfile, type CreatorProfile } from './creator-profile'

export async function fetchCreatorProfile(slug: string): Promise<CreatorProfile | null> {
  return getCreatorProfile(slug)
}
