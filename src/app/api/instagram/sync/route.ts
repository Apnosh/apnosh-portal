import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchInstagramInsights } from '@/lib/instagram'

/**
 * POST /api/instagram/sync
 *
 * Pulls latest Instagram metrics for a specific client (or all clients)
 * and upserts into the social_metrics table.
 *
 * Body: { clientId?: string }  — if omitted, syncs all connected clients.
 *
 * Protected: admin-only via profile check, or called by a cron job
 * with the service role key in the Authorization header.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Auth check: either admin user or service-role bearer token
  const authHeader = request.headers.get('authorization')
  const isServiceRole = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  if (!isServiceRole) {
    // Check if the caller is an authenticated admin
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSb = await createServerClient()
    const { data: { user } } = await serverSb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
  }

  let body: { clientId?: string } = {}
  try { body = await request.json() } catch { /* empty body = sync all */ }

  // Fetch connections to sync
  let query = supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'instagram')
    .not('ig_account_id', 'is', null)
    .not('access_token', 'is', null)

  if (body.clientId) {
    query = query.eq('client_id', body.clientId)
  }

  const { data: connections } = await query

  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No Instagram connections found' })
  }

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const results: { clientId: string; username: string; success: boolean; error?: string }[] = []

  for (const conn of connections) {
    try {
      const insights = await fetchInstagramInsights(conn.ig_account_id, conn.access_token)

      // Count posts published this month from content_queue
      const { count: postsPublished } = await supabase
        .from('content_queue')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', conn.client_id)
        .eq('service_area', 'social')
        .eq('status', 'posted')
        .gte('updated_at', new Date(year, month - 1, 1).toISOString())
        .lt('updated_at', new Date(year, month, 1).toISOString())

      const { count: postsPlanned } = await supabase
        .from('content_queue')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', conn.client_id)
        .eq('service_area', 'social')
        .in('status', ['scheduled', 'approved', 'drafting', 'in_review', 'confirmed', 'new'])

      // Get previous month for follower delta
      const { data: prevRow } = await supabase
        .from('social_metrics')
        .select('followers_count')
        .eq('client_id', conn.client_id)
        .eq('platform', 'instagram')
        .eq('month', month === 1 ? 12 : month - 1)
        .eq('year', month === 1 ? year - 1 : year)
        .maybeSingle()

      const followersChange = prevRow
        ? insights.followers_count - prevRow.followers_count
        : 0

      // Upsert into social_metrics
      const { error: upsertErr } = await supabase
        .from('social_metrics')
        .upsert({
          client_id: conn.client_id,
          platform: 'instagram',
          month,
          year,
          posts_published: postsPublished ?? 0,
          posts_planned: postsPlanned ?? 0,
          total_reach: insights.reach,
          total_impressions: insights.impressions,
          total_engagement: insights.accounts_engaged,
          likes: 0, // Not broken down individually in the new API
          comments: 0,
          shares: 0,
          saves: 0,
          followers_count: insights.followers_count,
          followers_change: followersChange,
          top_post_url: insights.top_post?.permalink ?? null,
          top_post_caption: insights.top_post?.caption ?? null,
          top_post_engagement: insights.top_post
            ? (insights.top_post.like_count + insights.top_post.comments_count)
            : null,
          top_post_image_url: insights.top_post?.media_url ?? null,
          recorded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'client_id,platform,month,year',
        })

      if (upsertErr) throw upsertErr

      results.push({ clientId: conn.client_id, username: conn.username, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[instagram sync] Failed for ${conn.username}:`, message)
      results.push({ clientId: conn.client_id, username: conn.username, success: false, error: message })
    }
  }

  return NextResponse.json({
    synced: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  })
}
