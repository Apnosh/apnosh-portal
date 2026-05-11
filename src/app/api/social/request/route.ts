/**
 * POST /api/social/request
 *
 * Receives a streamlined content request from the client side
 * (src/app/dashboard/social/request) and lands it in the strategist's
 * task queue as a `client_tasks` row.
 *
 * Keeping it on client_tasks (instead of the rich
 * graphic_requests/video_requests tables) means strategists see the
 * request the second it arrives without needing the client to fill out
 * 20 specialized fields. The strategist converts to a full brief when
 * they pick it up.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  clientId: string
  type: string | null
  description: string
  assetLinks: string | null
  quickDate: string | null
  customDate: string | null
  platforms: string[]
}

const TYPE_LABEL: Record<string, string> = {
  new_dish: 'New menu item',
  event:    'Event or special',
  bts:      'Behind the scenes',
  feature:  'Staff or customer feature',
  review:   'Customer review',
  promo:    'Promo or deal',
  other:    'Other',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!body.clientId || typeof body.clientId !== 'string') {
    return new NextResponse('clientId required', { status: 400 })
  }
  if (!body.description || body.description.trim().length < 5) {
    return new NextResponse('description too short', { status: 400 })
  }

  // Confirm the signed-in user can act for this client. Admin bypass,
  // else require a business / client_user link.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'
  if (!isAdmin) {
    const [{ data: biz }, { data: cu }] = await Promise.all([
      supabase.from('businesses').select('client_id').eq('owner_id', user.id).eq('client_id', body.clientId).maybeSingle(),
      supabase.from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', body.clientId).maybeSingle(),
    ])
    if (!biz && !cu) {
      return new NextResponse('Not authorized for this client', { status: 403 })
    }
  }

  // Compute due_at from the quick-date / custom-date pickers.
  let dueAt: string | null = null
  if (body.customDate) {
    dueAt = new Date(`${body.customDate}T17:00:00`).toISOString()
  } else if (body.quickDate === 'ASAP') {
    dueAt = new Date(Date.now() + 1 * 86_400_000).toISOString()
  } else if (body.quickDate === 'This week') {
    dueAt = new Date(Date.now() + 5 * 86_400_000).toISOString()
  } else if (body.quickDate === 'Next week') {
    dueAt = new Date(Date.now() + 10 * 86_400_000).toISOString()
  }

  const typeLabel = body.type ? TYPE_LABEL[body.type] ?? 'Content' : 'Content'
  const oneLine = body.description.split(/\r?\n/)[0].slice(0, 80).trim()
  const title = `Request: ${typeLabel} — ${oneLine}`

  // Structured markdown body so strategists can paste-copy into a
  // richer graphic_requests / video_requests brief later.
  const bodyParts: string[] = [
    `**Type:** ${typeLabel}`,
    '',
    `**What:**`,
    body.description.trim(),
    '',
  ]
  if (body.assetLinks) {
    bodyParts.push('**Assets:**')
    for (const line of body.assetLinks.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      bodyParts.push(`- ${line}`)
    }
    bodyParts.push('')
  }
  if (body.quickDate || body.customDate) {
    bodyParts.push(`**When:** ${body.customDate ? body.customDate : body.quickDate}`)
  }
  if (body.platforms && body.platforms.length > 0) {
    bodyParts.push(`**Platforms:** ${body.platforms.join(', ')}`)
  } else {
    bodyParts.push(`**Platforms:** Strategist picks`)
  }

  const admin = createAdminClient()
  const { data: inserted, error: insertErr } = await admin
    .from('client_tasks')
    .insert({
      client_id: body.clientId,
      title,
      body: bodyParts.join('\n'),
      status: 'todo',
      due_at: dueAt,
      assignee_type: 'admin',
      visible_to_client: true,
    })
    .select('id')
    .single()

  if (insertErr) {
    return new NextResponse(`Could not save: ${insertErr.message}`, { status: 500 })
  }

  // Best-effort event log entry — non-fatal if it fails.
  await admin
    .from('events')
    .insert({
      client_id: body.clientId,
      event_type: 'content_request.created',
      subject_type: 'client_task',
      subject_id: inserted?.id ?? null,
      actor_id: user.id,
      actor_role: isAdmin ? 'admin' : 'client',
      summary: `${typeLabel} request from owner`,
      payload: {
        type: body.type,
        platforms: body.platforms,
        has_assets: !!body.assetLinks,
      },
    })

  return NextResponse.json({ ok: true, taskId: inserted?.id ?? null })
}
