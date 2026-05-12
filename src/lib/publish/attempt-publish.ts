/**
 * Single-draft publish flow used by /api/work/drafts/[id]/lifecycle
 * (action='publish'). Wraps the multi-platform publisher with the
 * draft-specific preflight, success capture, and error reporting
 * the new content engine needs.
 *
 * Returns a structured result instead of throwing. Callers decide
 * whether to roll back draft.status on failure.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { publishToAllPlatforms, resolveOverallStatus } from '@/lib/publish'
import { getPublishConnectionsForClient } from './get-connections'
import type { PlatformPublishResult } from '@/types/database'

export interface AttemptPublishResult {
  ok: boolean
  /** When ok=false: short message safe to show in the UI. */
  error?: string
  /** When ok=false: machine-readable code so the UI can branch. */
  errorCode?:
    | 'no_caption'
    | 'no_media'
    | 'no_platforms'
    | 'no_connections'
    | 'missing_platform_connection'
    | 'all_platforms_failed'
    | 'draft_not_found'
  /** Per-platform results (always set if we reached the publish call). */
  perPlatform?: Record<string, PlatformPublishResult>
  /** A single URL to surface in the UI; first successful publish wins. */
  publishedUrl?: string
  /** Same idea: first platform's post id, used as a back-reference. */
  publishedPostId?: string
}

interface DraftRow {
  id: string
  client_id: string
  caption: string | null
  hashtags: string[] | null
  media_urls: string[] | null
  target_platforms: string[] | null
  status: string
}

/**
 * Validate + publish. Does NOT mutate draft.status — the caller
 * (lifecycle route) controls the state machine. We do write
 * published_at / published_url / published_post_id on the draft
 * when at least one platform succeeds, so the row carries the
 * receipt even if a later step fails.
 */
export async function attemptPublish(draftId: string): Promise<AttemptPublishResult> {
  const admin = createAdminClient()

  const { data: draftRaw } = await admin
    .from('content_drafts')
    .select('id, client_id, caption, hashtags, media_urls, target_platforms, status')
    .eq('id', draftId)
    .maybeSingle()
  if (!draftRaw) return { ok: false, errorCode: 'draft_not_found', error: 'draft not found' }

  const draft = draftRaw as DraftRow

  // Preflight: all the gating rules in one place so the UI can mirror them.
  const caption = (draft.caption ?? '').trim()
  if (!caption) return { ok: false, errorCode: 'no_caption', error: 'Add a caption before publishing.' }

  const mediaUrls = Array.isArray(draft.media_urls) ? draft.media_urls.filter(Boolean) : []
  // Instagram requires at least one image. Facebook can publish text-only,
  // but our editorial flow always wants visuals — enforce uniformly for v1.
  if (mediaUrls.length === 0) {
    return { ok: false, errorCode: 'no_media', error: 'Attach at least one image before publishing.' }
  }

  const platforms = (draft.target_platforms ?? []).filter(Boolean)
  if (platforms.length === 0) {
    return { ok: false, errorCode: 'no_platforms', error: 'Pick at least one platform to publish to.' }
  }

  const connections = await getPublishConnectionsForClient(draft.client_id)
  if (connections.length === 0) {
    return {
      ok: false,
      errorCode: 'no_connections',
      error: 'No active social accounts connected for this client.',
    }
  }

  // Ensure every requested platform has a matching connection.
  const haveByPlatform = new Set(connections.map(c => c.platform))
  const missing = platforms.filter(p => !haveByPlatform.has(p))
  if (missing.length > 0) {
    return {
      ok: false,
      errorCode: 'missing_platform_connection',
      error: `Connect ${missing.join(', ')} before publishing.`,
    }
  }

  // Hashtag handling: append as a trailing line. Some platforms (IG)
  // weight in-caption hashtags more than first-comment ones; trailing
  // line is the safest default until per-platform tuning is added.
  const hashtags = Array.isArray(draft.hashtags) ? draft.hashtags : []
  const hashtagLine = hashtags
    .map(h => (h.startsWith('#') ? h : `#${h}`))
    .filter(h => h.length > 1)
    .join(' ')
  const text = hashtagLine ? `${caption}\n\n${hashtagLine}` : caption

  // Infer media type from the URLs. The publish lib branches on this.
  const mediaType: 'image' | 'video' | 'carousel' =
    mediaUrls.length > 1 ? 'carousel'
    : /\.(mp4|mov|m4v|webm)(\?|$)/i.test(mediaUrls[0]) ? 'video'
    : 'image'

  const perPlatform = await publishToAllPlatforms(
    {
      text,
      mediaUrls,
      mediaType,
      linkUrl: null,
      platforms,
    },
    // Map our adapter shape to the publish lib's expected shape.
    connections.map(c => ({
      platform: c.platform,
      access_token: c.access_token,
      page_id: c.page_id,
      ig_account_id: c.ig_account_id,
    })),
  )

  const overall = resolveOverallStatus(perPlatform)
  const firstWin = Object.values(perPlatform).find(r => r.status === 'published')

  // Build a clickable permalink to surface back on the draft card.
  // Different platforms hand back IDs in different shapes; we cover
  // the common ones and let everything else fall through to undefined.
  function buildPermalink(map: Record<string, PlatformPublishResult>): string | undefined {
    const ig = map.instagram
    if (ig?.status === 'published' && ig.post_id) {
      // IG returns numeric media id; the shortcode permalink needs a separate fetch.
      // For v1 we link to the account; richer permalink lookup is Phase 2.
      return 'https://instagram.com'
    }
    const fb = map.facebook
    if (fb?.status === 'published' && fb.post_id) {
      // FB post_id is `pageId_postId` — that resolves directly.
      return `https://facebook.com/${fb.post_id}`
    }
    return undefined
  }

  if (!firstWin) {
    return {
      ok: false,
      errorCode: 'all_platforms_failed',
      error: 'No platform accepted the post — see per-platform errors.',
      perPlatform,
    }
  }

  // Capture the receipt on the draft. We use the first successful
  // platform's URL/post id; the full per-platform map is logged via
  // events for audit and surfaced in the UI if needed.
  // PlatformPublishResult carries post_id but no URL; build a permalink
  // for the platforms where we know the shape, fall back to undefined.
  const publishedPostId = firstWin.post_id ?? undefined
  const publishedUrl = buildPermalink(perPlatform)

  if (publishedUrl || publishedPostId) {
    await admin
      .from('content_drafts')
      .update({
        published_at: new Date().toISOString(),
        published_url: publishedUrl ?? null,
        // Note: content_drafts.published_post_id references social_posts,
        // not the platform-side ID, so we DON'T write it from here.
        // Phase 2 will create a social_posts row + link.
      })
      .eq('id', draftId)
  }

  // Audit event with the full per-platform breakdown so support can
  // trace partial-failure scenarios later.
  await admin.from('events').insert({
    client_id: draft.client_id,
    event_type: 'draft.published_to_platforms',
    subject_type: 'content_draft',
    subject_id: draftId,
    actor_role: 'system',
    summary: `Published to ${Object.entries(perPlatform).filter(([, v]) => v.status === 'published').map(([k]) => k).join(', ')}`,
    payload: { perPlatform, overall },
  })

  // Suppress the "all failed" case (handled above). If we got here,
  // at least one platform succeeded — surface that as ok, with the
  // partial-failure visible in perPlatform.
  return {
    ok: true,
    perPlatform,
    publishedUrl,
    publishedPostId,
  }
}
