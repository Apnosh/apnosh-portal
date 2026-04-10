import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publishToAllPlatforms, resolveOverallStatus } from '@/lib/publish'

/**
 * POST /api/social/publish
 *
 * Publish a post to selected platforms for a client.
 *
 * Body: {
 *   clientId: string,
 *   text: string,
 *   mediaUrls?: string[],
 *   mediaType?: 'image' | 'video' | 'carousel',
 *   linkUrl?: string,
 *   platforms: string[],
 *   scheduledFor?: string (ISO),
 *   contentQueueId?: string,
 *   campaignTagId?: string,
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Auth: admin only
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const serverSb = await createServerClient()
  const { data: { user } } = await serverSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })

  const body = await request.json()
  const {
    clientId, text, mediaUrls, mediaType, linkUrl, platforms,
    scheduledFor, contentQueueId, campaignTagId,
    // Extended options
    locationId, locationName, userTags, altText, firstComment,
    coverUrl, collaborators, hashtags,
  } = body

  if (!clientId || !text?.trim() || !platforms?.length) {
    return NextResponse.json({ error: 'clientId, text, and platforms are required' }, { status: 400 })
  }

  // Resolve team member ID
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // If scheduling for later, just save the record
  if (scheduledFor && new Date(scheduledFor) > new Date()) {
    const { data: post, error } = await supabase
      .from('scheduled_posts')
      .insert({
        client_id: clientId,
        created_by: teamMember?.id || null,
        text: text.trim(),
        media_urls: mediaUrls || [],
        media_type: mediaType || null,
        link_url: linkUrl || null,
        platforms,
        scheduled_for: scheduledFor,
        status: 'scheduled',
        content_queue_id: contentQueueId || null,
        campaign_tag_id: campaignTagId || null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      postId: post.id,
      status: 'scheduled',
      scheduledFor,
    })
  }

  // Publish now
  // Get platform connections for this client
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, access_token, page_id, ig_account_id')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: 'No platform connections found for this client' }, { status: 400 })
  }

  // Create the scheduled_post record first
  const { data: post, error: insertError } = await supabase
    .from('scheduled_posts')
    .insert({
      client_id: clientId,
      created_by: teamMember?.id || null,
      text: text.trim(),
      media_urls: mediaUrls || [],
      media_type: mediaType || null,
      link_url: linkUrl || null,
      platforms,
      status: 'publishing',
      content_queue_id: contentQueueId || null,
      campaign_tag_id: campaignTagId || null,
    })
    .select('id')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Publish to all selected platforms
  const results = await publishToAllPlatforms(
    {
      text: text.trim(),
      mediaUrls: mediaUrls || [],
      mediaType: mediaType || null,
      linkUrl: linkUrl || null,
      platforms,
    },
    connections as { platform: string; access_token: string | null; page_id: string | null; ig_account_id: string | null }[],
  )

  // Update the record with results
  const overallStatus = resolveOverallStatus(results)
  await supabase
    .from('scheduled_posts')
    .update({
      status: overallStatus,
      platform_results: results,
      updated_at: new Date().toISOString(),
    })
    .eq('id', post.id)

  return NextResponse.json({
    success: overallStatus === 'published',
    postId: post.id,
    status: overallStatus,
    results,
  })
}
