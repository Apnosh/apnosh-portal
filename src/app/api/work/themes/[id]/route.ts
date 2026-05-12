/**
 * PATCH /api/work/themes/[id] — edit an existing theme.
 *
 * Bumps editorial_themes.version so AI generations record which
 * version of the theme they ran against (principle #4).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Body {
  themeName?: string
  themeBlurb?: string
  pillars?: string[]
  strategistNotes?: string
  status?: 'planning' | 'shared' | 'archived'
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null

  // Load current row so we can bump version + return updated.
  const { data: current } = await supabase
    .from('editorial_themes')
    .select('id, version')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'theme not found' }, { status: 404 })

  const updates: Record<string, unknown> = {
    version: Number(current.version ?? 1) + 1,
  }
  if (typeof body?.themeName === 'string')        updates.theme_name = body.themeName
  if (typeof body?.themeBlurb === 'string')       updates.theme_blurb = body.themeBlurb
  if (Array.isArray(body?.pillars))               updates.pillars = body.pillars
  if (typeof body?.strategistNotes === 'string')  updates.strategist_notes = body.strategistNotes
  if (body?.status && ['planning','shared','archived'].includes(body.status)) {
    updates.status = body.status
  }

  const { data, error } = await supabase
    .from('editorial_themes')
    .update(updates)
    .eq('id', id)
    .select('id, theme_name, theme_blurb, pillars, status, version')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, theme: data })
}
