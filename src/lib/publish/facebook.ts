/**
 * Publish a post to a Facebook Page.
 *
 * Requires `pages_manage_posts` permission on the Page token.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface FacebookPublishResult {
  success: boolean
  postId?: string
  error?: string
}

/**
 * Publish a text + optional image/link post to a Facebook Page.
 */
export interface FacebookPublishOptions {
  placeId?: string
  tags?: string[] // user IDs to tag
}

export async function publishToFacebook(
  pageId: string,
  pageToken: string,
  text: string,
  imageUrl?: string | null,
  linkUrl?: string | null,
  options?: FacebookPublishOptions,
): Promise<FacebookPublishResult> {
  try {
    if (imageUrl) {
      // Photo post
      const res = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: imageUrl,
          message: text,
          access_token: pageToken,
        }),
      })
      const data = await res.json()
      if (data.error) {
        return { success: false, error: data.error.message }
      }
      return { success: true, postId: data.id || data.post_id }
    }

    if (linkUrl) {
      // Link post
      const res = await fetch(`${GRAPH}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          link: linkUrl,
          access_token: pageToken,
        }),
      })
      const data = await res.json()
      if (data.error) {
        return { success: false, error: data.error.message }
      }
      return { success: true, postId: data.id }
    }

    // Text-only post
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        access_token: pageToken,
      }),
    })
    const data = await res.json()
    if (data.error) {
      return { success: false, error: data.error.message }
    }
    return { success: true, postId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
