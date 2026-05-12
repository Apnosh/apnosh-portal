/**
 * Display labels for team capabilities.
 *
 * Lives in its own module (not get-team.ts) because get-team.ts is a
 * 'use server' file, which can only export async functions + types.
 * Static lookup tables go here so both server and client code can
 * import them freely.
 */

export const ROLE_LABEL: Record<string, string> = {
  strategist: 'Strategist',
  social_media_manager: 'Social Media Manager',
  copywriter: 'Copywriter',
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor: 'Video Editor',
  community_mgr: 'Community Manager',
  ad_buyer: 'Paid Media Specialist',
  seo_specialist: 'SEO Specialist',
  influencer: 'Influencer Partner',
  admin: 'Apnosh team',
}
