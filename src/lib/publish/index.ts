/**
 * Multi-platform publish orchestrator.
 *
 * Takes a post + the client's platform connections, publishes to each
 * selected platform, and returns per-platform results.
 */

import { publishToFacebook } from './facebook'
import { publishToInstagram } from './instagram'
import { publishToTikTok } from './tiktok'
import { publishToLinkedIn } from './linkedin'
import type { PlatformPublishResult } from '@/types/database'

interface PlatformConnection {
  platform: string
  access_token: string | null
  page_id: string | null
  ig_account_id: string | null
}

interface PublishInput {
  text: string
  mediaUrls: string[]
  mediaType: 'image' | 'video' | 'carousel' | null
  linkUrl: string | null
  platforms: string[]
  // Extended options
  locationId?: string
  userTags?: { username: string; x: number; y: number }[]
  altText?: string
  firstComment?: string
  coverUrl?: string
  collaborators?: string[]
}

export async function publishToAllPlatforms(
  input: PublishInput,
  connections: PlatformConnection[],
): Promise<Record<string, PlatformPublishResult>> {
  const results: Record<string, PlatformPublishResult> = {}

  for (const platform of input.platforms) {
    const conn = connections.find(c => c.platform === platform)

    if (!conn || !conn.access_token) {
      results[platform] = {
        status: 'not_connected',
        error: `${platform} is not connected for this client`,
      }
      continue
    }

    try {
      if (platform === 'facebook') {
        const fbResult = await publishToFacebook(
          conn.page_id!,
          conn.access_token,
          input.text,
          input.mediaUrls[0] || null,
          input.linkUrl,
        )
        results[platform] = {
          status: fbResult.success ? 'published' : 'failed',
          post_id: fbResult.postId,
          published_at: fbResult.success ? new Date().toISOString() : undefined,
          error: fbResult.error,
        }
      } else if (platform === 'instagram') {
        const isVideo = input.mediaType === 'video'
        const isCarousel = input.mediaType === 'carousel' && input.mediaUrls.length > 1
        const igResult = await publishToInstagram(
          conn.ig_account_id!,
          conn.access_token,
          input.text,
          isVideo ? null : input.mediaUrls[0] || null,
          isVideo ? input.mediaUrls[0] || null : null,
          input.mediaType,
          isCarousel ? input.mediaUrls : undefined,
          {
            locationId: input.locationId,
            userTags: input.userTags,
            altText: input.altText,
            firstComment: input.firstComment,
            coverUrl: input.coverUrl,
            collaborators: input.collaborators,
          },
        )
        results[platform] = {
          status: igResult.success ? 'published' : 'failed',
          post_id: igResult.postId,
          published_at: igResult.success ? new Date().toISOString() : undefined,
          error: igResult.error,
        }
      } else if (platform === 'tiktok') {
        const ttResult = await publishToTikTok(
          conn.access_token,
          input.text,
          input.mediaUrls[0] || null,
        )
        results[platform] = {
          status: ttResult.success ? 'published' : 'failed',
          post_id: ttResult.postId,
          published_at: ttResult.success ? new Date().toISOString() : undefined,
          error: ttResult.error,
        }
      } else if (platform === 'linkedin') {
        const liResult = await publishToLinkedIn(
          conn.access_token,
          conn.ig_account_id, // reused for org ID
          input.text,
          input.mediaUrls[0] || null,
        )
        results[platform] = {
          status: liResult.success ? 'published' : 'failed',
          post_id: liResult.postId,
          published_at: liResult.success ? new Date().toISOString() : undefined,
          error: liResult.error,
        }
      } else {
        results[platform] = {
          status: 'failed',
          error: `Platform ${platform} is not supported yet`,
        }
      }
    } catch (err) {
      results[platform] = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  return results
}

/**
 * Determine overall status from per-platform results.
 */
export function resolveOverallStatus(
  results: Record<string, PlatformPublishResult>,
): 'published' | 'partially_failed' | 'failed' {
  const statuses = Object.values(results).map(r => r.status)
  const published = statuses.filter(s => s === 'published').length
  const total = statuses.filter(s => s !== 'not_connected').length

  if (published === total && total > 0) return 'published'
  if (published > 0) return 'partially_failed'
  return 'failed'
}
