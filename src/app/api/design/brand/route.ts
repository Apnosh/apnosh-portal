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
