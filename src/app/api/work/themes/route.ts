/**
 * POST /api/work/themes
 *
 * Strategist or admin creates an editorial theme for a client in
 * their book. RLS prevents creating themes for unassigned clients.
 *
 * Body:
 *   { clientId, month (YYYY-MM-01), themeName, themeBlurb?, pillars?, keyDates?, strategistNotes? }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Body {
  clientId?: string
  month?: string
  themeName?: string
  themeBlurb?: string
  pillars?: unknown
  keyDates?: unknown
  strategistNotes?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.clientId || !body?.month || !body?.themeName) {
    return NextResponse.json({ error: 'clientId, month, themeName required' }, { status: 400 })
  }

  // RLS on editorial_themes: only strategists assigned to this client
  // (or admins) can insert. We let it speak for itself rather than
  // duplicating the check here.
  const { data, error } = await supabase
    .from('editorial_themes')
    .insert({
      client_id: body.clientId,
      month: body.month,
      theme_name: body.themeName,
      theme_blurb: body.themeBlurb ?? null,
      pillars: body.pillars ?? [],
      key_dates: body.keyDates ?? [],
      strategist_notes: body.strategistNotes ?? null,
      status: 'planning',  // valid statuses: planning | shared | archived
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
