/**
 * Publish to Instagram Business Account.
 *
 * Uses the Instagram API with the Instagram User Token.
 * Steps:
 * 1. Create a media container with image_url + caption
 * 2. Wait for processing to finish
 * 3. Publish the container
 */

const IG_API = 'https://graph.instagram.com/v21.0'

export interface InstagramPublishResult {
  success: boolean
  postId?: string
  error?: string
}

async function waitForProcessing(containerId: string, token: string, maxWait = 30000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${IG_API}/${containerId}?fields=status_code`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.status_code === 'FINISHED') return true
    if (data.status_code === 'ERROR') return false
    // Wait 2 seconds between checks
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

export interface InstagramPublishOptions {
  locationId?: string
  userTags?: { username: string; x: number; y: number }[]
  altText?: string
  coverUrl?: string
  firstComment?: string
  collaborators?: string[]
}

export async function publishToInstagram(
  igAccountId: string,
  token: string,
  text: string,
  imageUrl?: string | null,
  videoUrl?: string | null,
  mediaType?: 'image' | 'video' | 'carousel' | null,
  carouselUrls?: string[],
  options?: InstagramPublishOptions,
): Promise<InstagramPublishResult> {
  if (!imageUrl && !videoUrl && (!carouselUrls || carouselUrls.length === 0)) {
    return { success: false, error: 'Instagram requires an image or video to publish.' }
  }

  try {
    let containerId: string

    if (mediaType === 'carousel' && carouselUrls && carouselUrls.length > 1) {
      // Carousel: create child containers, then a carousel container
      const childIds: string[] = []
      for (const url of carouselUrls) {
        const isVideo = url.match(/\.(mp4|mov|webm)(\?|$)/i)
        const childRes = await fetch(`${IG_API}/${igAccountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(isVideo ? { video_url: url, media_type: 'VIDEO' } : { image_url: url }),
            is_carousel_item: true,
            access_token: token,
          }),
        })
        const child = await childRes.json()
        if (child.error) return { success: false, error: child.error.message }
        if (child.id) {
          const ready = await waitForProcessing(child.id, token)
          if (!ready) return { success: false, error: `Carousel item processing failed: ${url}` }
          childIds.push(child.id)
        }
      }

      const carouselRes = await fetch(`${IG_API}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          caption: text,
          children: childIds.join(','),
          access_token: token,
        }),
      })
      const carousel = await carouselRes.json()
      if (carousel.error) return { success: false, error: carousel.error.message }
      containerId = carousel.id

    } else if (videoUrl || (mediaType === 'video')) {
      // Reel / Video
      const reelBody: Record<string, unknown> = {
        video_url: videoUrl || imageUrl,
        caption: text,
        media_type: 'REELS',
        access_token: token,
      }
      if (options?.coverUrl) reelBody.cover_url = options.coverUrl
      if (options?.locationId) reelBody.location_id = options.locationId
      if (options?.collaborators?.length) reelBody.collaborators = options.collaborators
      if (options?.altText) reelBody.alt_text = options.altText

      const containerRes = await fetch(`${IG_API}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reelBody),
      })
      const container = await containerRes.json()
      if (container.error) return { success: false, error: container.error.error_user_msg || container.error.message }
      containerId = container.id

    } else {
      // Single image
      const imageBody: Record<string, unknown> = {
        image_url: imageUrl,
        caption: text,
        access_token: token,
      }
      if (options?.locationId) imageBody.location_id = options.locationId
      if (options?.altText) imageBody.alt_text = options.altText
      if (options?.collaborators?.length) imageBody.collaborators = options.collaborators
      if (options?.userTags?.length) {
        imageBody.user_tags = options.userTags.map(t => ({
          username: t.username,
          x: t.x,
          y: t.y,
        }))
      }

      const containerRes = await fetch(`${IG_API}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageBody),
      })
      const container = await containerRes.json()
      if (container.error) return { success: false, error: container.error.error_user_msg || container.error.message }
      containerId = container.id
    }

    if (!containerId) return { success: false, error: 'Failed to create media container' }

    // Step 2: Wait for processing
    const ready = await waitForProcessing(containerId, token)
    if (!ready) {
      return { success: false, error: 'Media processing timed out or failed. Make sure the URL is publicly accessible.' }
    }

    // Step 3: Publish
    const publishRes = await fetch(`${IG_API}/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: token,
      }),
    })
    const published = await publishRes.json()

    if (published.error) {
      return { success: false, error: published.error.message }
    }

    // Step 4: Post first comment (for hashtags etc.) if provided
    if (options?.firstComment && published.id) {
      try {
        await fetch(`${IG_API}/${published.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: options.firstComment,
            access_token: token,
          }),
        })
      } catch {
        // Don't fail the whole publish if first comment fails
      }
    }

    return { success: true, postId: published.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
