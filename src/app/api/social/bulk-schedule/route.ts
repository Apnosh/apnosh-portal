import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/social/bulk-schedule
 *
 * Upload a CSV of posts to schedule in bulk.
 * CSV format: date,time,text,image_url,platforms
 *
 * Body: { clientId, posts: [{ date, time, text, imageUrl?, platforms }] }
 */
export async function POST(request: NextRequest) {
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const serverSb = await createServerClient()
  const { data: { user } } = await serverSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await serverSb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })

  const body = await request.json()
  const { clientId, posts } = body

  if (!clientId || !posts?.length) {
    return NextResponse.json({ error: 'clientId and posts array required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve team member
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const created: string[] = []
  const errors: string[] = []

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    try {
      const scheduledFor = post.date && post.time
        ? new Date(`${post.date}T${post.time}`).toISOString()
        : post.date
        ? new Date(`${post.date}T12:00:00`).toISOString()
        : null

      const platforms = (post.platforms || 'instagram')
        .split(',')
        .map((p: string) => p.trim().toLowerCase())
        .filter(Boolean)

      const { data, error } = await supabase
        .from('scheduled_posts')
        .insert({
          client_id: clientId,
          created_by: teamMember?.id || null,
          text: post.text || '',
          media_urls: post.imageUrl ? [post.imageUrl] : [],
          media_type: post.imageUrl ? 'image' : null,
          platforms,
          scheduled_for: scheduledFor,
          status: scheduledFor ? 'scheduled' : 'draft',
        })
        .select('id')
        .single()

      if (error) {
        errors.push(`Row ${i + 1}: ${error.message}`)
      } else if (data) {
        created.push(data.id)
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Failed'}`)
    }
  }

  return NextResponse.json({
    created: created.length,
    errors: errors.length,
    errorDetails: errors.length > 0 ? errors : undefined,
  })
}
