import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  fetchInstagramComments, replyToInstagramComment, deleteInstagramComment,
  fetchInstagramConversations, fetchInstagramMessages, sendInstagramDM,
  fetchInstagramPosts, deleteInstagramPost,
  fetchFacebookComments, replyToFacebookComment,
  fetchFacebookPosts, deleteFacebookPost, editFacebookPost,
} from '@/lib/social-inbox'

/**
 * POST /api/social/inbox
 *
 * Unified social inbox API. Handles all comment/DM/post operations.
 *
 * Body: { action, clientId, platform?, ...params }
 *
 * Actions:
 * - fetch_comments: get comments across platforms
 * - reply_comment: reply to a comment
 * - delete_comment: delete a comment (IG only)
 * - fetch_conversations: get DM conversations
 * - fetch_messages: get messages in a conversation
 * - send_dm: send a direct message
 * - fetch_posts: get published posts
 * - delete_post: delete a post
 * - edit_post: edit a post caption (FB only)
 */
export async function POST(request: NextRequest) {
  // Auth check
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const serverSb = await createServerClient()
  const { data: { user } } = await serverSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const body = await request.json()
  const { action, clientId } = body

  if (!action || !clientId) {
    return NextResponse.json({ error: 'action and clientId required' }, { status: 400 })
  }

  // Non-admins must own this client and can only run safe actions.
  // Destructive ops (delete / edit on the live platform) stay admin-only.
  if (!isAdmin) {
    const DESTRUCTIVE = new Set(['delete_comment', 'delete_post', 'edit_post'])
    if (DESTRUCTIVE.has(action)) {
      return NextResponse.json({ error: 'Admin required for this action' }, { status: 403 })
    }
    const [{ data: biz }, { data: cu }] = await Promise.all([
      serverSb.from('businesses').select('client_id').eq('owner_id', user.id).eq('client_id', clientId).maybeSingle(),
      serverSb.from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle(),
    ])
    if (!biz && !cu) {
      return NextResponse.json({ error: 'Not authorized for this client' }, { status: 403 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get connections for this client
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, access_token, ig_account_id, page_id')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: 'No platform connections found' }, { status: 400 })
  }

  const igConn = connections.find(c => c.platform === 'instagram')
  const fbConn = connections.find(c => c.platform === 'facebook')

  console.log('[inbox]', action, '| connections:', connections.length, '| ig:', !!igConn, '| fb:', !!fbConn, '(page_id:', fbConn?.page_id, ')')

  try {
    switch (action) {
      // ── Comments ──
      case 'fetch_comments': {
        const results: unknown[] = []
        const errors: string[] = []
        if (igConn) {
          try {
            const igComments = await fetchInstagramComments(igConn.ig_account_id!, igConn.access_token!)
            results.push(...igComments)
          } catch (e) { errors.push('IG: ' + (e instanceof Error ? e.message : 'failed')) }
        }
        if (fbConn) {
          try {
            const fbComments = await fetchFacebookComments(fbConn.page_id!, fbConn.access_token!)
            results.push(...fbComments)
          } catch (e) { errors.push('FB: ' + (e instanceof Error ? e.message : 'failed')) }
        }
        results.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return NextResponse.json({ comments: results, errors: errors.length > 0 ? errors : undefined })
      }

      case 'reply_comment': {
        const { commentId, text, platform } = body
        if (platform === 'instagram' && igConn) {
          const r = await replyToInstagramComment(commentId, text, igConn.access_token!)
          return NextResponse.json(r)
        }
        if (platform === 'facebook' && fbConn) {
          const r = await replyToFacebookComment(commentId, text, fbConn.access_token!)
          return NextResponse.json(r)
        }
        return NextResponse.json({ error: 'Platform not connected' }, { status: 400 })
      }

      case 'delete_comment': {
        const { commentId } = body
        if (igConn) {
          const r = await deleteInstagramComment(commentId, igConn.access_token!)
          return NextResponse.json(r)
        }
        return NextResponse.json({ error: 'Not supported' }, { status: 400 })
      }

      // ── DMs ──
      case 'fetch_conversations': {
        const results = []
        if (igConn) {
          const convos = await fetchInstagramConversations(igConn.ig_account_id!, igConn.access_token!)
          results.push(...convos)
        }
        return NextResponse.json({ conversations: results })
      }

      case 'fetch_messages': {
        const { conversationId } = body
        if (igConn) {
          const msgs = await fetchInstagramMessages(conversationId, igConn.access_token!)
          return NextResponse.json({ messages: msgs })
        }
        return NextResponse.json({ messages: [] })
      }

      case 'send_dm': {
        const { recipientId, text } = body
        if (igConn) {
          const r = await sendInstagramDM(recipientId, text, igConn.ig_account_id!, igConn.access_token!)
          return NextResponse.json(r)
        }
        return NextResponse.json({ error: 'Not supported' }, { status: 400 })
      }

      // ── Posts ──
      case 'fetch_posts': {
        const results: unknown[] = []
        const errors: string[] = []
        if (igConn) {
          try {
            const igPosts = await fetchInstagramPosts(igConn.ig_account_id!, igConn.access_token!)
            results.push(...igPosts)
          } catch (e) { errors.push('IG: ' + (e instanceof Error ? e.message : 'failed')) }
        }
        if (fbConn) {
          try {
            const fbPosts = await fetchFacebookPosts(fbConn.page_id!, fbConn.access_token!)
            results.push(...fbPosts)
          } catch (e) { errors.push('FB: ' + (e instanceof Error ? e.message : 'failed')) }
        }
        results.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return NextResponse.json({ posts: results, errors: errors.length > 0 ? errors : undefined })
      }

      case 'delete_post': {
        const { postId, platform } = body
        if (platform === 'instagram' && igConn) {
          const r = await deleteInstagramPost(postId, igConn.access_token!)
          return NextResponse.json(r)
        }
        if (platform === 'facebook' && fbConn) {
          const r = await deleteFacebookPost(postId, fbConn.access_token!)
          return NextResponse.json(r)
        }
        return NextResponse.json({ error: 'Platform not connected' }, { status: 400 })
      }

      case 'edit_post': {
        const { postId, newCaption, platform } = body
        if (platform === 'facebook' && fbConn) {
          const r = await editFacebookPost(postId, newCaption, fbConn.access_token!)
          return NextResponse.json(r)
        }
        return NextResponse.json({ error: 'Editing is only supported on Facebook' }, { status: 400 })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
