/**
 * POST /api/admin/editorial-themes — upsert a single month's theme.
 *
 * Body: { clientId, month, themeName, themeBlurb, pillars,
 *         keyDates, status, strategistNotes }
 *
 * (client_id, month) is the natural key.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set(['planning', 'shared', 'archived'])

interface Body {
  clientId: string
  month: string  // 'YYYY-MM-01'
  themeName: string
  themeBlurb?: string | null
  pillars?: string[]
  keyDates?: Array<{ date: string; label: string; note?: string }>
  status?: 'planning' | 'shared' | 'archived'
  strategistNotes?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') {
    return new NextResponse('Admin only', { status: 403 })
  }

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!body.clientId || !body.month || !body.themeName?.trim()) {
    return new NextResponse('clientId, month, themeName required', { status: 400 })
  }
  if (!/^\d{4}-\d{2}-01$/.test(body.month)) {
    return new NextResponse('month must be YYYY-MM-01', { status: 400 })
  }
  if (body.status && !VALID_STATUS.has(body.status)) {
    return new NextResponse('Invalid status', { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('editorial_themes')
    .upsert({
      client_id: body.clientId,
      month: body.month,
      theme_name: body.themeName.trim(),
      theme_blurb: body.themeBlurb ?? null,
      pillars: body.pillars ?? [],
      key_dates: body.keyDates ?? [],
      status: body.status ?? 'planning',
      strategist_notes: body.strategistNotes ?? null,
      created_by: user.id,
    }, { onConflict: 'client_id,month' })

  if (error) {
    return new NextResponse(`Could not save: ${error.message}`, { status: 500 })
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: `theme.${body.status === 'shared' ? 'shared' : 'updated'}`,
    subject_type: 'editorial_theme',
    actor_id: user.id,
    actor_role: 'admin',
    summary: `${body.status === 'shared' ? 'Shared' : 'Updated'} theme for ${body.month}: ${body.themeName}`,
    payload: { month: body.month, pillars: body.pillars?.length ?? 0, key_dates: body.keyDates?.length ?? 0 },
  })

  return NextResponse.json({ ok: true })
}
