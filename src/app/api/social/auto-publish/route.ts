import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToAllPlatforms, resolveOverallStatus } from '@/lib/publish'

/**
 * POST /api/social/auto-publish
 *
 * Background job that finds all scheduled posts due now and publishes them.
 * Called by a cron job or manually by admin.
 *
 * Can also be triggered with { postId } to publish a specific post.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Auth: service role key or admin
  const authHeader = request.headers.get('authorization')
  const isServiceRole = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  if (!isServiceRole) {
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSb = await createServerClient()
    const { data: { user } } = await serverSb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  let body: { postId?: string } = {}
  try { body = await request.json() } catch {}

  // Find posts to publish
  let query = supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')

  if (body.postId) {
    query = query.eq('id', body.postId)
  } else {
    // Only posts scheduled for now or earlier
    query = query.lte('scheduled_for', new Date().toISOString())
  }

  const { data: posts } = await query
  if (!posts || posts.length === 0) {
    return NextResponse.json({ published: 0, message: 'No posts due for publishing' })
  }

  const results: { postId: string; status: string; platforms: Record<string, unknown> }[] = []

  for (const post of posts) {
    // Update status to publishing
    await supabase
      .from('scheduled_posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', post.id)

    // Get platform connections for this client
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('platform, access_token, page_id, ig_account_id')
      .eq('client_id', post.client_id)
      .not('access_token', 'is', null)

    if (!connections || connections.length === 0) {
      await supabase
        .from('scheduled_posts')
        .update({
          status: 'failed',
          platform_results: { error: 'No platform connections found' },
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)
      results.push({ postId: post.id, status: 'failed', platforms: {} })
      continue
    }

    // Publish
    const platformResults = await publishToAllPlatforms(
      {
        text: post.text,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        linkUrl: post.link_url,
        platforms: post.platforms || [],
      },
      connections as { platform: string; access_token: string | null; page_id: string | null; ig_account_id: string | null }[],
    )

    const overallStatus = resolveOverallStatus(platformResults)

    await supabase
      .from('scheduled_posts')
      .update({
        status: overallStatus,
        platform_results: platformResults,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id)

    // If published, also update the content_queue item if linked
    if (overallStatus === 'published' && post.content_queue_id) {
      await supabase
        .from('content_queue')
        .update({ status: 'posted', updated_at: new Date().toISOString() })
        .eq('id', post.content_queue_id)
    }

    results.push({ postId: post.id, status: overallStatus, platforms: platformResults })
  }

  return NextResponse.json({
    published: results.filter(r => r.status === 'published').length,
    failed: results.filter(r => r.status === 'failed' || r.status === 'partially_failed').length,
    results,
  })
}
