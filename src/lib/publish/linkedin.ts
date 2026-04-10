/**
 * Publish to LinkedIn (Organization page or personal profile).
 *
 * Requires w_organization_social (org) or w_member_social (personal).
 * Currently a stub for org publishing — will be activated once
 * Community Management API is approved.
 */

export interface LinkedInPublishResult {
  success: boolean
  postId?: string
  error?: string
}

export async function publishToLinkedIn(
  _token: string,
  _orgId: string | null,
  _text: string,
  _imageUrl?: string | null,
): Promise<LinkedInPublishResult> {
  // TODO: Implement once Community Management API is approved
  // Steps:
  // 1. If image: register upload → upload image → get asset URN
  // 2. POST /ugcPosts with author (org or person URN), text, and media
  return {
    success: false,
    error: 'LinkedIn publishing is not yet available. The Community Management API is pending approval.',
  }
}
