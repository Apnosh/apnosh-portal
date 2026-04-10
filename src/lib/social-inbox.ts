/**
 * Social Inbox API helpers.
 *
 * Read/reply to comments, read/reply to DMs, manage posts
 * across Instagram and Facebook.
 */

const IG_API = 'https://graph.instagram.com/v21.0'
const FB_API = 'https://graph.facebook.com/v21.0'

// ─── Types ──────────────────────────────────────────────────

export interface SocialComment {
  id: string
  platform: 'instagram' | 'facebook'
  postId: string
  postCaption?: string
  postImageUrl?: string
  author: string
  authorAvatar?: string
  text: string
  timestamp: string
  replies?: SocialComment[]
  likeCount?: number
}

export interface SocialMessage {
  id: string
  platform: 'instagram' | 'facebook'
  conversationId: string
  author: string
  authorAvatar?: string
  text: string
  timestamp: string
  isFromPage: boolean
}

export interface SocialConversation {
  id: string
  platform: 'instagram' | 'facebook'
  participantName: string
  participantAvatar?: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
}

export interface PublishedPost {
  id: string
  platform: 'instagram' | 'facebook'
  caption: string
  mediaUrl?: string
  mediaType: 'image' | 'video' | 'carousel'
  permalink: string
  timestamp: string
  likeCount: number
  commentCount: number
  shareCount?: number
}

// ─── Instagram Comments ─────────────────────────────────────

export async function fetchInstagramComments(
  igAccountId: string,
  token: string,
): Promise<SocialComment[]> {
  const comments: SocialComment[] = []

  // Get recent media
  const mediaRes = await fetch(
    `${IG_API}/${igAccountId}/media?fields=id,caption,media_url,timestamp&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const media = await mediaRes.json()

  for (const post of media.data ?? []) {
    // Get comments on each post
    const commentsRes = await fetch(
      `${IG_API}/${post.id}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const commentsData = await commentsRes.json()

    for (const c of commentsData.data ?? []) {
      comments.push({
        id: c.id,
        platform: 'instagram',
        postId: post.id,
        postCaption: post.caption?.slice(0, 80),
        postImageUrl: post.media_url,
        author: c.username,
        text: c.text,
        timestamp: c.timestamp,
        replies: (c.replies?.data ?? []).map((r: { id: string; text: string; username: string; timestamp: string }) => ({
          id: r.id,
          platform: 'instagram' as const,
          postId: post.id,
          author: r.username,
          text: r.text,
          timestamp: r.timestamp,
        })),
      })
    }
  }

  return comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export async function replyToInstagramComment(
  commentId: string,
  text: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_API}/${commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: token }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

export async function deleteInstagramComment(
  commentId: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_API}/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

// ─── Instagram DMs ──────────────────────────────────────────

export async function fetchInstagramConversations(
  igAccountId: string,
  token: string,
): Promise<SocialConversation[]> {
  try {
    const res = await fetch(
      `${IG_API}/${igAccountId}/conversations?fields=id,participants,messages{id,message,from,created_time}&platform=instagram`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.error) return []

    return (data.data ?? []).map((conv: { id: string; participants: { data: { id: string; username: string }[] }; messages: { data: { message: string; created_time: string }[] } }) => ({
      id: conv.id,
      platform: 'instagram' as const,
      participantName: conv.participants?.data?.[0]?.username || 'Unknown',
      lastMessage: conv.messages?.data?.[0]?.message || '',
      lastMessageTime: conv.messages?.data?.[0]?.created_time || '',
      unreadCount: 0,
    }))
  } catch {
    return []
  }
}

export async function fetchInstagramMessages(
  conversationId: string,
  token: string,
): Promise<SocialMessage[]> {
  try {
    const res = await fetch(
      `${IG_API}/${conversationId}?fields=messages{id,message,from,created_time}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    return (data.messages?.data ?? []).map((m: { id: string; message: string; from: { username: string; id: string }; created_time: string }) => ({
      id: m.id,
      platform: 'instagram' as const,
      conversationId,
      author: m.from?.username || 'Unknown',
      text: m.message,
      timestamp: m.created_time,
      isFromPage: false,
    }))
  } catch {
    return []
  }
}

export async function sendInstagramDM(
  recipientId: string,
  text: string,
  igAccountId: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_API}/${igAccountId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        access_token: token,
      }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

// ─── Instagram Post Management ──────────────────────────────

export async function fetchInstagramPosts(
  igAccountId: string,
  token: string,
): Promise<PublishedPost[]> {
  const res = await fetch(
    `${IG_API}/${igAccountId}/media?fields=id,caption,media_url,media_type,permalink,timestamp,like_count,comments_count&limit=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return (data.data ?? []).map((p: { id: string; caption: string; media_url: string; media_type: string; permalink: string; timestamp: string; like_count: number; comments_count: number }) => ({
    id: p.id,
    platform: 'instagram' as const,
    caption: p.caption || '',
    mediaUrl: p.media_url,
    mediaType: p.media_type === 'VIDEO' ? 'video' : p.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image',
    permalink: p.permalink,
    timestamp: p.timestamp,
    likeCount: p.like_count || 0,
    commentCount: p.comments_count || 0,
  }))
}

export async function deleteInstagramPost(
  mediaId: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_API}/${mediaId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

// ─── Facebook Comments ──────────────────────────────────────

export async function fetchFacebookComments(
  pageId: string,
  pageToken: string,
): Promise<SocialComment[]> {
  const comments: SocialComment[] = []

  try {
    // Get recent posts
    const postsRes = await fetch(
      `${FB_API}/${pageId}/posts?fields=id,message,full_picture,created_time&limit=10`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    const posts = await postsRes.json()
    if (posts.error) {
      console.error('[fetchFacebookComments] posts error:', posts.error.message)
      return []
    }

    for (const post of posts.data ?? []) {
      try {
        const commentsRes = await fetch(
          `${FB_API}/${post.id}/comments?fields=id,message,from,created_time`,
          { headers: { Authorization: `Bearer ${pageToken}` } }
        )
        const commentsData = await commentsRes.json()
        if (commentsData.error) continue

        for (const c of commentsData.data ?? []) {
          comments.push({
            id: c.id,
            platform: 'facebook',
            postId: post.id,
            postCaption: post.message?.slice(0, 80),
            postImageUrl: post.full_picture,
            author: c.from?.name || 'Someone',
            text: c.message,
            timestamp: c.created_time,
          })
        }
      } catch { /* skip individual post errors */ }
    }
  } catch (err) {
    console.error('[fetchFacebookComments] Error:', err)
  }

  return comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export async function replyToFacebookComment(
  commentId: string,
  text: string,
  pageToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${FB_API}/${commentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, access_token: pageToken }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

// ─── Facebook Post Management ───────────────────────────────

export async function fetchFacebookPosts(
  pageId: string,
  pageToken: string,
): Promise<PublishedPost[]> {
  try {
    const res = await fetch(
      `${FB_API}/${pageId}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=25`,
      { headers: { Authorization: `Bearer ${pageToken}` } }
    )
    const data = await res.json()
    if (data.error) {
      console.error('[fetchFacebookPosts] API error:', data.error.message)
      return []
    }
    return (data.data ?? []).map((p: { id: string; message?: string; full_picture?: string; permalink_url?: string; created_time: string }) => ({
      id: p.id,
      platform: 'facebook' as const,
      caption: p.message || '',
      mediaUrl: p.full_picture || undefined,
      mediaType: 'image' as const,
      permalink: p.permalink_url || `https://facebook.com/${p.id}`,
      timestamp: p.created_time,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
    }))
  } catch (err) {
    console.error('[fetchFacebookPosts] Error:', err)
    return []
  }
}

export async function deleteFacebookPost(
  postId: string,
  pageToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${FB_API}/${postId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pageToken}` },
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}

export async function editFacebookPost(
  postId: string,
  newMessage: string,
  pageToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${FB_API}/${postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: newMessage, access_token: pageToken }),
    })
    const data = await res.json()
    if (data.error) return { success: false, error: data.error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed' }
  }
}
