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
import { getApprovalSettings } from '@/lib/work/approval-settings'
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
    | 'awaiting_signoff'
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
  client_signed_off_at: string | null
  published_at: string | null
  published_url: string | null
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
    .select('id, client_id, caption, hashtags, media_urls, target_platforms, status, client_signed_off_at, published_at, published_url')
    .eq('id', draftId)
    .maybeSingle()
  if (!draftRaw) return { ok: false, errorCode: 'draft_not_found', error: 'draft not found' }

  const draft = draftRaw as DraftRow

  // Idempotency: a draft that already carries a publish receipt must never post
  // again — a manual staff publish racing the 5-minute cron (or a double-tap)
  // would otherwise put the same post on the feed twice. Return the existing
  // receipt so every caller converges on the same success.
  if (draft.published_at) {
    return { ok: true, publishedUrl: draft.published_url ?? undefined }
  }

  // Owner-consent gate, enforced at the one chokepoint every publish path
  // shares (manual publish, the schedule action + publish-scheduled cron,
  // auto-publish-on-signoff) — the manual route checks this too, but a
  // scheduled draft used to slip past it entirely. Mirrors the lifecycle
  // route's rule exactly: a trusted strategist may bypass when
  // allow_strategist_direct_publish is on. The cron treats this code as a
  // soft skip (stays scheduled), so the post goes out on the first tick
  // after the owner signs.
  const settings = await getApprovalSettings(draft.client_id)
  if (
    settings.client_signoff_required &&
    !draft.client_signed_off_at &&
    !settings.allow_strategist_direct_publish
  ) {
    return {
      ok: false,
      errorCode: 'awaiting_signoff',
      error: 'Waiting for the owner to sign off before this can go live.',
    }
  }

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
      gbp_resource_name: c.gbp_resource_name ?? null,
      linkedin_urn: c.linkedin_urn ?? null,
    })),
  )

  const overall = resolveOverallStatus(perPlatform)
  const firstWin = Object.values(perPlatform).find(r => r.status === 'published')

  // Build a clickable permalink to surface back on the draft card.
  // IG returns a numeric media id and needs a follow-up fetch to get
  // the real /p/{shortcode}/ URL. FB returns `{pageId}_{postId}` which
  // resolves directly.
  async function buildPermalink(
    map: Record<string, PlatformPublishResult>,
  ): Promise<string | undefined> {
    const ig = map.instagram
    if (ig?.status === 'published' && ig.post_id) {
      const igConn = connections.find(c => c.platform === 'instagram')
      if (igConn?.access_token) {
        try {
          const r = await fetch(
            `https://graph.instagram.com/v21.0/${ig.post_id}?fields=permalink&access_token=${encodeURIComponent(igConn.access_token)}`,
          )
          if (r.ok) {
            const j = (await r.json()) as { permalink?: string }
            if (j.permalink) return j.permalink
          }
        } catch {
          // Fall through to the account-level link rather than failing
          // the whole publish — the post is live, we just couldn't
          // resolve its URL.
        }
      }
      // Best-effort fallback: link to the account so the UI button
      // still works even if the lookup fails.
      const handle = igConn?.accountName
      return handle ? `https://instagram.com/${handle}` : 'https://instagram.com'
    }
    const fb = map.facebook
    if (fb?.status === 'published' && fb.post_id) {
      return `https://facebook.com/${fb.post_id}`
    }
    // LinkedIn returns the post URN; the public URL is /feed/update/{urn}.
    const li = map.linkedin
    if (li?.status === 'published' && li.post_id) {
      const encoded = encodeURIComponent(li.post_id)
      return `https://www.linkedin.com/feed/update/${encoded}/`
    }
    // GBP returns post_id as `accounts/.../locations/.../localPosts/.../`
    // The post itself doesn't have a stable public URL on Google Search
    // (it's surfaced contextually), so we link to the location's Google
    // Maps profile via the platform_url stored on the connection.
    const gbp = map.gbp ?? map.google_business_profile
    if (gbp?.status === 'published') {
      const gbpConn = connections.find(c => c.platform === 'gbp')
      // gbp_resource_name = accounts/{accountId}/locations/{locationId}
      // We can construct a place-search URL using the location name.
      if (gbpConn?.accountName) {
        return `https://www.google.com/search?q=${encodeURIComponent(gbpConn.accountName)}`
      }
      return 'https://business.google.com/posts'
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
  const publishedUrl = await buildPermalink(perPlatform)

  if (publishedUrl || publishedPostId) {
    await admin
      .from('content_drafts')
      .update({
        published_at: new Date().toISOString(),
        published_url: publishedUrl ?? null,
      })
      .eq('id', draftId)
  }

  // Close the publish→outcomes loop: seed a social_posts row for the winning
  // platform and link the draft to it. The nightly metrics sync upserts on
  // (client_id, platform, external_id), so it fills reach/likes into THIS row
  // and the outcomes reader (which resolves solely via published_post_id) can
  // finally attach real numbers — without this, every published piece read
  // "Posted, waiting on numbers" forever. Best-effort: recording must never
  // fail a publish that already happened.
  //
  // Platform choice: Instagram is the only platform the per-post metrics sync
  // covers today, so when Instagram succeeded the stub must carry ITS post id
  // even if another platform's publish resolved first — otherwise the synced
  // numbers land in a row the draft never points at and the piece reads as
  // gathering forever. Any other mix keeps the first win.
  const igWin = perPlatform.instagram
  const igStubId = igWin?.status === 'published' ? igWin.post_id : undefined
  const stubPlatform = igStubId
    ? 'instagram'
    : Object.entries(perPlatform).find(([, r]) => r.status === 'published')?.[0]
  const stubPostId = igStubId ?? publishedPostId
  if (stubPlatform && stubPostId) {
    try {
      const { data: stub } = await admin
        .from('social_posts')
        .upsert({
          client_id: draft.client_id,
          platform: stubPlatform,
          external_id: stubPostId,
          permalink: publishedUrl ?? null,
          caption,
          media_url: mediaUrls[0] ?? null,
          posted_at: new Date().toISOString(),
          source_draft_id: draftId,
        }, { onConflict: 'client_id,platform,external_id' })
        .select('id')
        .maybeSingle()
      if (stub?.id) {
        await admin.from('content_drafts').update({ published_post_id: stub.id }).eq('id', draftId)
      }
    } catch (e) {
      console.error('publish recorded but social_posts link failed', draftId, e)
    }
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

  // Money-in: a published TEAM/AI campaign piece accrues its owner charge here —
  // this is the one success point every publish path shares (manual, cron,
  // auto-on-signoff). Best-effort + idempotent; non-campaign drafts no-op inside.
  // Dynamic import: work-orders pulls in the campaign server module, keeping this
  // publish lib free of a static dependency cycle.
  try {
    const { accrueChargeForPublishedDraft } = await import('@/lib/campaigns/work-orders')
    await accrueChargeForPublishedDraft(draftId)
  } catch (e) {
    console.error('publish charge accrual threw', draftId, e)
  }

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
