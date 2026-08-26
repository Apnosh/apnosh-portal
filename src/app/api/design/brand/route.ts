import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/design/brand — the caller's brand kit on file (client_brands), so a
 * graphic order can carry it by default: the owner gave us this once, no order
 * should ask again. Never errors the flow: { brand: null } on any miss, and the
 * brief falls back to "match their existing pages".
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ brand: null })
  try {
    const admin = createAdminClient()
    const { data: biz } = await admin
      .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
    let clientId = (biz?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await admin
        .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
    if (!clientId) return NextResponse.json({ brand: null })
    const { data: b } = await admin
      .from('client_brands')
      .select('logo_url, primary_color, secondary_color, accent_color, font_display, font_body, visual_style, photo_style')
      .eq('client_id', clientId)
      .maybeSingle()
    if (!b) return NextResponse.json({ brand: null })
    const str = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
    return NextResponse.json({
      brand: {
        logoUrl: str(b.logo_url) ? b.logo_url : null,
        colors: [b.primary_color, b.secondary_color, b.accent_color].filter(str),
        fonts: [b.font_display, b.font_body].filter(str),
        visualStyle: str(b.visual_style) ? b.visual_style : null,
        photoStyle: str(b.photo_style) ? b.photo_style : null,
      },
    })
  } catch {
    return NextResponse.json({ brand: null })
  }
}

/**
 * POST /api/design/brand — save the owner's brand kit to the ACCOUNT
 * (client_brands), from the order flow's brand sheet. Give it once, every
 * future order carries it. Body: { logoUrl?, colors? (up to 3 hex) }.
 * Only provided fields change. Returns the updated kit in GET's shape.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  try {
    const body = (await req.json().catch(() => ({}))) as { logoUrl?: unknown; colors?: unknown }
    const admin = createAdminClient()
    const { data: biz } = await admin
      .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
    let clientId = (biz?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await admin
        .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
    if (!clientId) return NextResponse.json({ error: 'No business on this account yet.' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (typeof body.logoUrl === 'string' && /^https:\/\//.test(body.logoUrl)) patch.logo_url = body.logoUrl.slice(0, 500)
    if (Array.isArray(body.colors)) {
      const hex = body.colors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3)
      if (hex.length || body.colors.length === 0) {
        patch.primary_color = hex[0] ?? null
        patch.secondary_color = hex[1] ?? null
        patch.accent_color = hex[2] ?? null
      }
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

    const { data: existing } = await admin
      .from('client_brands').select('id').eq('client_id', clientId).maybeSingle()
    if (existing?.id) {
      const { error } = await admin.from('client_brands').update(patch).eq('client_id', clientId)
      if (error) throw error
    } else {
      const { error } = await admin.from('client_brands').insert({ client_id: clientId, ...patch })
      if (error) throw error
    }

    const { data: b } = await admin
      .from('client_brands')
      .select('logo_url, primary_color, secondary_color, accent_color, font_display, font_body, visual_style, photo_style')
      .eq('client_id', clientId)
      .maybeSingle()
    const str = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
    return NextResponse.json({
      brand: b ? {
        logoUrl: str(b.logo_url) ? b.logo_url : null,
        colors: [b.primary_color, b.secondary_color, b.accent_color].filter(str),
        fonts: [b.font_display, b.font_body].filter(str),
        visualStyle: str(b.visual_style) ? b.visual_style : null,
        photoStyle: str(b.photo_style) ? b.photo_style : null,
      } : null,
    })
  } catch {
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
}
