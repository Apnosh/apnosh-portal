/**
 * Publish to LinkedIn — either a personal member's feed (w_member_social)
 * or a company organization page (w_organization_social).
 *
 * Both paths use the v2 ugcPosts endpoint. Image attach is a 3-step
 * dance: register an upload, PUT the binary, reference the asset URN
 * in the post body.
 *
 * Scope reality check:
 *   - w_member_social: generally available, doesn't need LinkedIn
 *     Partner approval. Posts to /in/<member-sub>.
 *   - w_organization_social: requires LinkedIn Community Management
 *     API approval. Until that's granted, org posts return 403.
 *
 * The OAuth flow under src/app/api/auth/linkedin/ currently only
 * requests `openid profile` so neither posting scope is granted to
 * existing tokens — see the README follow-up to broaden the scope.
 */

const API = 'https://api.linkedin.com/v2'
const REST_API = 'https://api.linkedin.com/rest'

export interface LinkedInPublishResult {
  success: boolean
  postId?: string
  error?: string
}

interface UgcPostBody {
  author: string
  lifecycleState: 'PUBLISHED'
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: { text: string }
      shareMediaCategory: 'NONE' | 'IMAGE'
      media?: Array<{
        status: 'READY'
        description?: { text: string }
        media: string  // asset URN
        title?: { text: string }
      }>
    }
  }
  visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
}

/**
 * Author URN. LinkedIn rejects raw IDs — must be prefixed.
 *
 * Personal:   urn:li:person:<sub>
 * Org page:   urn:li:organization:<id>
 *
 * We sniff by the ID shape: org IDs are pure digits, member subs are
 * 20+ char alphanumeric. Caller can pass the explicit URN to skip.
 */
function asAuthorUrn(idOrUrn: string): string {
  if (idOrUrn.startsWith('urn:li:')) return idOrUrn
  // Org IDs are typically all digits, member subs are alphanumeric.
  if (/^\d+$/.test(idOrUrn)) return `urn:li:organization:${idOrUrn}`
  return `urn:li:person:${idOrUrn}`
}

/**
 * Three-step image upload. Returns the asset URN to embed in the post.
 */
async function uploadImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string,
): Promise<{ assetUrn: string } | { error: string }> {
  // 1. Register upload
  let regRes: Response
  try {
    regRes = await fetch(`${API}/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [
            { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
          ],
        },
      }),
    })
  } catch (e) {
    return { error: `register upload failed: ${e instanceof Error ? e.message : 'unknown'}` }
  }
  if (!regRes.ok) {
    const body = await regRes.text().catch(() => '')
    return { error: `register upload ${regRes.status}: ${body.slice(0, 200)}` }
  }
  const reg = await regRes.json() as {
    value?: {
      uploadMechanism?: {
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
          uploadUrl?: string
        }
      }
      asset?: string
    }
  }
  const uploadUrl = reg.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl
  const assetUrn = reg.value?.asset
  if (!uploadUrl || !assetUrn) {
    return { error: 'register upload returned no uploadUrl/asset' }
  }

  // 2. Fetch the image binary
  let imgRes: Response
  try {
    imgRes = await fetch(imageUrl)
  } catch (e) {
    return { error: `image fetch failed: ${e instanceof Error ? e.message : 'unknown'}` }
  }
  if (!imgRes.ok) return { error: `image fetch ${imgRes.status}` }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer())

  // 3. PUT the binary at LinkedIn's upload URL
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: imgBuf,
  })
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '')
    return { error: `binary upload ${putRes.status}: ${body.slice(0, 200)}` }
  }

  return { assetUrn }
}

export async function publishToLinkedIn(
  accessToken: string,
  authorIdOrUrn: string | null,
  text: string,
  imageUrl?: string | null,
): Promise<LinkedInPublishResult> {
  if (!accessToken) return { success: false, error: 'LinkedIn access token missing.' }
  if (!authorIdOrUrn) return { success: false, error: 'LinkedIn author id/URN missing.' }
  if (!text?.trim()) return { success: false, error: 'Post text is empty.' }

  const authorUrn = asAuthorUrn(authorIdOrUrn)

  let media: UgcPostBody['specificContent']['com.linkedin.ugc.ShareContent']['media']
  if (imageUrl) {
    const up = await uploadImage(accessToken, authorUrn, imageUrl)
    if ('error' in up) {
      return { success: false, error: `image upload: ${up.error}` }
    }
    media = [{ status: 'READY', media: up.assetUrn }]
  }

  const body: UgcPostBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: media ? 'IMAGE' : 'NONE',
        ...(media ? { media } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  let res: Response
  try {
    res = await fetch(`${API}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { success: false, error: `ugcPosts fetch: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    // LinkedIn returns 403 with `serviceErrorCode` 100 when scope is
    // missing — surface that clearly so the user knows what to fix.
    return {
      success: false,
      error: `LinkedIn ${res.status}: ${txt.slice(0, 280)}`,
    }
  }

  // The post ID lives in the x-restli-id response header, or the
  // body's `id` field if Restli formatting isn't honored.
  const postId =
    res.headers.get('x-restli-id') ??
    (await res.json().catch(() => null) as { id?: string } | null)?.id

  return {
    success: true,
    postId: postId ?? undefined,
  }
}

// Surface in case callers need to construct URNs directly.
export { asAuthorUrn }
// Note: REST_API is exported as a future hook — Restful (versioned)
// LinkedIn endpoints will replace v2 ugcPosts eventually.
export { REST_API }
